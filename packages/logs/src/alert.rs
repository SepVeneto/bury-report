use bson::{doc, DateTime, Document};

use futures_util::TryStreamExt;
use once_cell::sync::Lazy;
use mongodb::{Client, Database};
use crate::services::task::KafkaProducer;
use dashmap::DashMap;
use log::{debug, error, info, warn};

use crate::alert::model::{ALERT_MAP, AlertFact, AlertFactInfo, AlertRuleMap, AppSummary, ErrorRaw, ErrorSummary, LINE_COL_RE, QUERY_RE, RULE_MAP, SUMMARY_MAP, UnionRule};
use crate::alert::notify::check_notify;
use crate::alert::tokenizer::Tokenizer;
use crate::model::alert_rule::CollectionType;
use crate::model::{
    BaseModel, QueryBase, QueryModel, alert_fact, alert_rule, apps
};
use crate::utils::{cal_md5, get_string};

mod tokenizer;
mod notify;
pub mod gc;
pub mod model;
pub mod group;

/// 单个应用在内存里保留的最大指纹数：防止高基数错误（message 带 traceId 等）把内存吃光。
/// 超限只会少记"聚合计数"，原始日志已经在请求路径落库。
pub static MAX_SUMMARIES_PER_APP: Lazy<usize> =
    Lazy::new(|| env_usize("MAX_SUMMARIES_PER_APP", 50_000));
/// 单个应用在内存里保留的最大告警事实数
pub static MAX_FACTS_PER_APP: Lazy<usize> =
    Lazy::new(|| env_usize("MAX_FACTS_PER_APP", 200_000));

fn env_usize(key: &str, default: usize) -> usize {
    std::env::var(key).ok().and_then(|v| v.parse().ok()).unwrap_or(default)
}

// 分组规则
/**
 * {
  "pattern": [
    { "type": "literal", "value": "route" },
    { "type": "literal", "value": "webview" },
    { "type": "number", "noise": true },
    { "type": "literal", "value": "before" },
    { "type": "literal", "value": "done" }
  ],
}
 */

pub async fn init(client: &Client) -> anyhow::Result<()> {
    // list_database_names 需要集群级权限，且启动瞬间 Mongo 不可达时会失败；
    // 这里必须能降级，否则整个聚合/回收循环都不会启动（线上踩过）。
    let apps: Vec<String> = match client.list_database_names(None, None).await {
        Ok(names) => names
            .into_iter()
            .filter(|name| name.starts_with("app_"))
            .collect(),
        Err(err) => {
            warn!("list_database_names 失败({}), 回退到 reporter.apps", err);
            list_apps_from_reporter(client).await?
        }
    };

    for app in &apps {
        info!("========应用{}========", app);
        let db = client.database(app);
        let rules = load_rules(&db).await;

        debug!("初始化规则{:?}", rules);
        RULE_MAP.insert(app.clone(), AlertRuleMap::from_models(rules));

        let facts = match alert_fact::Model::find_all(&db).await {
            Ok(facts) => facts,
            Err(err) => {
                error!("加载告警事实失败 {}: {}", app, err);
                vec![]
            }
        };
        // let fp_set= DashSet::new();
        let alert_fact_map = DashMap::new();

        for fact in &facts {
            // fp_set.insert(fp.clone());

            let fp = &fact.model.fingerprint;
            let data = AlertFactInfo {
                fingerprint: fp.clone(),
                ttl: fact.model.ttl,
                strategy: fact.model.strategy.clone(),
                last_seen: fact.model.last_seen,
                last_notify: fact.model.last_notify,
                need_update: false,
                count: fact.model.count,
                flush_count: 0,
            };

            alert_fact_map.insert(fp.clone(), data);
        }

        // info!("初始化指纹{}条", fp_set.len());
        // FP_MAP.insert(app.clone(), fp_set);
        info!("初始化事实{}条", alert_fact_map.len());
        let alert_fact = AlertFact {
            map: alert_fact_map,
        };
        ALERT_MAP.insert(app.clone(), alert_fact);
    }

    info!("告警规则初始化完成");
    // 聚合/回收循环由 main 启动：init 失败也必须保证循环存在
    Ok(())
}

/// 应用列表降级来源：reporter.apps（不需要 listDatabases 权限）
async fn list_apps_from_reporter(client: &Client) -> anyhow::Result<Vec<String>> {
    let db = client.database("reporter");
    let cursor = apps::Model::col(&db)
        .find(doc! { "is_delete": { "$ne": true } }, None)
        .await?;
    let list: Vec<apps::Model> = cursor.try_collect().await?;
    Ok(list
        .into_iter()
        .map(|app| format!("app_{}", app._id.to_hex()))
        .collect())
}

/// 逐条解析报警规则：单条文档字段类型不对时只跳过这一条，
/// 不能因为一条坏数据让整个应用的规则全部失效（线上踩过）。
pub async fn load_rules(db: &Database) -> Vec<QueryBase<alert_rule::Model>> {
    let col = db.collection::<Document>(alert_rule::Model::NAME);
    let cursor = match col
        .find(doc! { "is_delete": { "$ne": true } }, None)
        .await
    {
        Ok(cursor) => cursor,
        Err(err) => {
            error!("查询报警规则失败: {}", err);
            return vec![];
        }
    };
    let docs: Vec<Document> = match cursor.try_collect().await {
        Ok(docs) => docs,
        Err(err) => {
            error!("读取报警规则失败: {}", err);
            return vec![];
        }
    };
    let mut rules = Vec::with_capacity(docs.len());
    for rule in docs {
        match bson::from_document::<QueryBase<alert_rule::Model>>(rule.clone()) {
            Ok(rule) => rules.push(rule),
            Err(err) => warn!(
                "跳过无法解析的报警规则 {:?}: {}",
                rule.get("_id"),
                err
            ),
        }
    }
    rules
}

pub fn alert_error(
    producer: &KafkaProducer,
    appid: &str,
    raw: &ErrorRaw
) {
    let appid = format!("app_{}", appid);
    let fp = &raw.fingerprint;
    let error_type = get_string(&raw.data, "name");
    let summary = &raw.summary;

    debug!(target: "alert","{}: 指纹{}", summary, fp);

    let rule = check_rule(
        &appid,
        &fp,
        &error_type,
        &CollectionType::Error,
    );

    if let Some(rule) = &rule {
        let (need_notify, fact) = check_notify(&rule, &appid, &fp);
        if need_notify {
            debug!("通知策略{:?}, 是否通知{}, 告警次数{:?}", rule.strategy(), need_notify, fact);
            if let Some(fact) = fact {
                notify::trigger(producer, &rule, summary, &fact);
            }
        }
    }

    let now = DateTime::now();
    let summary_entry = ErrorSummary {
        name: get_string(&raw.data, "name"),
        message: get_string(&raw.data, "message"),
        page: raw.data.get("page").cloned(),
        summary: summary.to_string(),
        fingerprint: fp.clone(),
        first_seen: now,
        last_seen: now,
        count: 1,
        rule_id: rule.map(|r| r.id()),
    };

    let app_summary = SUMMARY_MAP
        .entry(appid.to_string())
        .or_insert_with(|| AppSummary {
            summaries: DashMap::new(),
        });
    if app_summary.summaries.len() >= *MAX_SUMMARIES_PER_APP
        && !app_summary.summaries.contains_key(fp)
    {
        warn!(
            target: "alert",
            "应用 {} 聚合指纹超过上限 {}，丢弃新指纹 {}",
            appid, *MAX_SUMMARIES_PER_APP, fp
        );
        return;
    }
    app_summary
        .summaries
        .entry(fp.clone())
        .and_modify(|s| {
            s.count += 1;
            s.last_seen = now;
        })
        .or_insert(summary_entry);
}



fn check_rule(
    appid: &str,
    fp: &String,
    error_type: &String,
    log_type: &CollectionType,
) -> Option<UnionRule> {
    let rules = RULE_MAP.get(appid);
    if let Some(rules) = rules {
        let fp_rule = rules.fingerprints.get(fp).filter(|r| r.enabled);
        if let Some(fp_rule) = fp_rule {
            debug!(target: "alert", "命中指纹/分组规则: {}", fp_rule.name);
            return Some(UnionRule::Fingerprint(fp_rule.clone()));
        }

        let type_rules = rules.types.get(error_type).filter(|r| r.enabled);
        if let Some(type_rule) = type_rules {
            debug!(target: "alert", "命中类型规则: {}", type_rule.name);
            return Some(UnionRule::TypeRule(type_rule.clone()));
        }

        let col_rule = rules.collection.get(log_type).filter(|r| r.enabled);
        if let Some(col_rule) = &col_rule {
            debug!(target: "alert", "命中集合规则: {}", col_rule.name);
        }
        match col_rule {
            Some(rule) => Some(UnionRule::Collection(rule.clone())),
            None => None,
        }
    } else {
        return None;
    }
}


// 指纹的来源包括对错误信息的md5和分组规则的id
pub fn normalize_error(error: &ErrorRaw) -> (String, String) {
    let message = get_string(&error.data, "message");

    let mut stack = get_string(&error.data, "stack");
    if !stack.is_empty() {
        stack = LINE_COL_RE.replace_all(&stack, ":{line}:{col}").to_string();
        stack = QUERY_RE.replace_all(&stack, "?{query}").to_string();
    }

    let appid = format!("app_{}", &error.appid);
    if let Some(col) = RULE_MAP.get(&appid) {
        debug!("应用{}存在分组{:?}", appid, col.group);
        if let Some(pattern) = col.group.get("pattern") {
            // 只有存在分组规则时才进行分片
            let tokenizer = Tokenizer::new(&message);
            // TODO: 不一定需要遍历每一条规则，可以先根据分词的结果过滤出关联的规则
            let match_rule = pattern.iter().find(|p| {
                debug!("匹配规则: {:?}, 内容: {:?}", p, tokenizer.tokens);
                p.is_match(&tokenizer.tokens)
            });
            debug!("命中规则: {:?}", match_rule);
            if let Some(match_rule) = match_rule {
                // 根据rule id生成的指纹
                let fp = match_rule.fp.to_string();
                let message = tokenizer.normalize();
                let summary = format!("{} {}", message, stack);
                return (fp, summary)
            }
        }
    }

    let name = get_string(&error.data, "name");
    let summary = format!("{} {}", message, stack);
    let md5_str = format!("{} {} {}", name, message, stack);
    let fingerprint = cal_md5(&md5_str);

    (fingerprint, summary)
}



/**
 * 判断时间是否过期
 */
pub fn is_expired(
    time: DateTime,
    ttl: i64,
    now: Option<chrono::DateTime<chrono::Utc>>,
) -> bool {
    let origin_time = time.to_chrono();
    let now = match now {
        Some(now) => now,
        None => chrono::Utc::now(),
    };
    now.signed_duration_since(origin_time) > chrono::Duration::seconds(ttl)
}
