use bson::DateTime;

use mongodb::Client;
use rdkafka::producer::BaseProducer;
use dashmap::DashMap;
use serde_json::{Value, Map};
use log::{debug, error, info};

use crate::alert::gc::run_flush;
use crate::alert::model::{ALERT_MAP, AlertFact, AlertFactInfo, AlertRuleMap, AppSummary, ErrorRaw, ErrorSummary, LINE_COL_RE, QUERY_RE, RULE_MAP, SUMMARY_MAP, UnionRule};
use crate::alert::notify::check_notify;
use crate::alert::tokenizer::Tokenizer;
use crate::model::alert_rule::CollectionType;
use crate::model::{
    QueryModel, alert_fact, alert_rule
};
use crate::utils::cal_md5;

mod tokenizer;
mod notify;
pub mod gc;
pub mod model;
pub mod group;

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
    let apps: Vec<String> = client
        .list_database_names(None, None)
        .await?
        .into_iter()
        .filter(|name| name.starts_with("app_"))
        .collect();

    for app in &apps {
        info!("========应用{}========", app);
        let db = client.database(app);
        let rules = match alert_rule::Model::find_all(&db).await {
            Ok(rules) => rules,
            Err(err) => {
                error!("获取规则失败: {}", err);
                vec![]
            }
        };

        debug!("初始化规则{:?}", rules);
        RULE_MAP.insert(app.clone(), AlertRuleMap::from_models(rules));

        let facts = alert_fact::Model::find_all(&db).await.unwrap();
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

    let flush_client = client.clone();
    tokio::spawn(async move {
        run_flush(flush_client).await;
    });

    Ok(())
}

pub fn alert_error(
    producer: &BaseProducer,
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

fn get_string(map: &Map<String, Value>, key: &str) -> String {
    map.get(key)
       .and_then(|v| v.as_str())
       .unwrap_or_default()
       .to_string()
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
