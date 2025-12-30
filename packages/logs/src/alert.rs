use std::collections::HashSet;

use bson::DateTime;
use mongodb::{Client, bson::doc};
use once_cell::sync::Lazy;
use rdkafka::producer::BaseProducer;
use regex::Regex;
use dashmap::DashMap;
use serde_json::{Value, Map, json};
use log::{debug, error, info};
use tokio::time::{Duration, interval};

use crate::model::alert_rule::{AlertNotify, AlertSource, AlertStrategy, CollectionRule, CollectionType, FingerprintRule, TypeRule};
use crate::model::{
    CreateModel, QueryBase, QueryModel, QueryResult, alert_fact, alert_rule, alert_summary, logs_error
};
use crate::services::task::send_json_to_kafka;

type AppId = String;
type ErrorRaw = logs_error::Model;

type ErrorSummary = alert_summary::Model;
type AlertRule = alert_rule::Model;

struct AppSummary {
    summaries: DashMap<String, ErrorSummary>,
}

type AlertFactInfo = alert_fact::Model;
struct AlertFact {
    map: DashMap<String, AlertFactInfo>
}

pub struct AlertRuleMap {
    collection: DashMap<CollectionType, CollectionRule>,
    fingerprints: DashMap<String, FingerprintRule>,
    types: DashMap<String, TypeRule>,
}
impl AlertRuleMap {
    pub fn from_models(models: Vec<QueryBase<AlertRule>>) -> Self {
        let collection = DashMap::new();
        let fingerprints = DashMap::new();
        let types = DashMap::new();

        for model in models {
            match model.model.source {
                AlertSource::Collection { ref log_type } => {
                    let rule = CollectionRule {
                        name: model.model.name,
                        enabled: model.model.enabled,
                        notify: model.model.notify,
                        log_type: log_type.clone(),
                    };
                    collection.insert(log_type.clone(), rule);
                }
                AlertSource::Fingerprint { fingerprint } => {
                    let rule = FingerprintRule {
                        name: model.model.name,
                        enabled: model.model.enabled,
                        notify: model.model.notify,
                    };
                    fingerprints.insert(fingerprint, rule);
                }
                AlertSource::ErrorType { text } => {
                    let rule = TypeRule {
                        name: model.model.name,
                        enabled: model.model.enabled,
                        notify: model.model.notify,
                    };
                    types.insert(text, rule);
                }
            }
        }

        Self { collection, fingerprints, types}
    }
}

static SUMMARY_MAP: Lazy<DashMap<AppId, AppSummary>> = Lazy::new(|| DashMap::new());

pub static RULE_MAP: Lazy<DashMap<AppId, AlertRuleMap>> = Lazy::new(|| DashMap::new());
static ALERT_MAP: Lazy<DashMap<AppId, AlertFact>> = Lazy::new(|| DashMap::new());
// pub static FP_MAP: Lazy<DashMap<AppId, DashSet<String>>> = Lazy::new(|| DashMap::new());

static LINE_COL_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r":\d+:\d+").unwrap());
static QUERY_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\?[^)]*").unwrap());

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

enum UnionRule {
    Collection(CollectionRule),
    Fingerprint(FingerprintRule),
    TypeRule(TypeRule),
}
impl UnionRule {
    pub fn strategy(&self) -> AlertStrategy {
        match self {
            UnionRule::Collection(rule) => rule.notify.strategy(),
            UnionRule::Fingerprint(rule) => rule.notify.strategy(),
            UnionRule::TypeRule(rule) => rule.notify.strategy(),
        }
    }

    pub fn ttl(&self) -> Option<i64> {
        match self {
            UnionRule::Collection(rule) => rule.notify.ttl(),
            UnionRule::Fingerprint(rule) => rule.notify.ttl(),
            UnionRule::TypeRule(rule) => rule.notify.ttl(),
        }
    }

    pub fn url(&self) -> String {
        match self {
            UnionRule::Collection(rule) => rule.notify.url(),
            UnionRule::Fingerprint(rule) => rule.notify.url(),
            UnionRule::TypeRule(rule) => rule.notify.url(),
        }
    }
    
    pub fn notify(&self) -> AlertNotify {
        match self {
            UnionRule::Collection(rule) => rule.notify.clone(),
            UnionRule::Fingerprint(rule) => rule.notify.clone(),
            UnionRule::TypeRule(rule) => rule.notify.clone(),
        }
    }

    pub fn type_human_readable(&self) -> String {
        match self {
            UnionRule::Collection(rule) => {
                match rule.log_type {
                    CollectionType::Error => "错误日志",
                    CollectionType::Networ => "网络日志",
                    CollectionType::Custom => "上报日志",
                }
            },
            UnionRule::Fingerprint(_) => "指纹",
            UnionRule::TypeRule(_) => "类型",
        }.into()
    }

    pub fn name(&self) -> String {
        match self {
            UnionRule::Collection(rule) => rule.name.clone(),
            UnionRule::Fingerprint(rule) => rule.name.clone(),
            UnionRule::TypeRule(rule) => rule.name.clone(),
        }
    }
}
pub fn alert_error(producer: &BaseProducer, appid: &str, raw: &ErrorRaw) {
    let appid = format!("app_{}", appid);
    let fp = &raw.fingerprint;
    let error_type = get_string(&raw.data, "name");
    let summary = &raw.summary;

    debug!(target: "alert","{}: 指纹{}", summary, fp);

    if let Some(rule) = check_rule(&appid, &fp, &error_type, &CollectionType::Error) {
        let (need_notify, fact) = check_notify(&rule, &appid, &fp);
        debug!("通知策略{:?}, 是否通知{}, 告警次数{}", rule.strategy(), need_notify, fact.count);
        if need_notify {
            notify(producer, &rule, summary, &fact);
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
            debug!(target: "alert", "命中指纹规则{}", fp_rule.name);
            return Some(UnionRule::Fingerprint(fp_rule.clone()));
        }

        let type_rules = rules.types.get(error_type).filter(|r| r.enabled);
        if let Some(type_rule) = type_rules {
            debug!(target: "alert", "命中类型规则{}", type_rule.name);
            return Some(UnionRule::TypeRule(type_rule.clone()));
        }

        let col_rule = rules.collection.get(log_type).filter(|r| r.enabled);
        if let Some(col_rule) = &col_rule {
            debug!(target: "alert", "命中集合规则{}", col_rule.name);
        }
        match col_rule {
            Some(rule) => Some(UnionRule::Collection(rule.clone())),
            None => None,
        }
    } else {
        return None;
    }
}


fn check_notify(
    rule: &UnionRule,
    appid: &str,
    fp: &str
) -> (bool, AlertFactInfo) {
    let alert_fact = ALERT_MAP
        .entry(appid.to_string())
        .or_insert_with(|| AlertFact {
            map: DashMap::new(),
        });

    let now = DateTime::now();

    let alert_fact_entry = AlertFactInfo {
        fingerprint: fp.to_string(),
        strategy: rule.strategy(),
        ttl: rule.ttl(),
        last_seen: now,
        last_notify: None,
        need_update: true,
        count: 1,
        flush_count: 1,
    };

    let mut fact = alert_fact.map
        .entry(fp.to_string())
        .and_modify(|s| {
            s.ttl = rule.ttl();
            s.last_seen = now;
            s.need_update = true;
            s.strategy = rule.strategy();
            s.count += 1;
            s.flush_count += 1;
        })
        .or_insert(alert_fact_entry);

    let need_notify = match rule.notify() {
        AlertNotify::Once { .. } => {
            if fact.last_notify.is_none() {
                fact.last_notify = Some(now);
                // TODO: 统一控制
                // 仅一次告警有7天的TTL
                fact.ttl = Some(60 * 60 * 24 * 7);
                true
            } else {
                false
            }
        },
        AlertNotify::Window { .. } => {
            if let Some(ttl) = fact.ttl {
                // 窗口期内不触发
                if let Some(last_notify) = fact.last_notify {
                    let expired = is_expired(last_notify, ttl, Some(now.to_chrono()));
                    if expired {
                        fact.last_notify = Some(now);
                    }
                    expired
                } else {
                    fact.last_notify = Some(now);
                    true
                }
            } else {
                fact.last_notify = Some(now);
                // 原告警是其它规则，后来切换成窗口期触发
                true
            }
        },
        AlertNotify::Limit { limit, .. } => {
            debug!("limit {limit}, trigger {count}", limit = limit, count = fact.flush_count);
            let trigger = fact.flush_count == limit;
            if trigger {
                fact.last_notify = Some(now);
            }
            trigger
        }
    };
    (need_notify, fact.clone())
}

fn notify(
    producer: &BaseProducer,
    rule: &UnionRule,
    summary: &String,
    fact: &AlertFactInfo,
) {
    let r#type = rule.type_human_readable();
    let data = json!({
        "url": rule.url(),
        "name": rule.name(),
        "type": r#type,
        "rule": rule.notify(),
        "fact": fact,
        "content": summary,
    });
    debug!("发送通知{:?}", data);
    send_json_to_kafka(producer, "notify", &data);
}

pub fn normalize_error(error: &ErrorRaw) -> (String, String) {
    let message = get_string(&error.data, "message");
    let mut stack = get_string(&error.data, "stack");
    let name = get_string(&error.data, "name");
    stack = LINE_COL_RE.replace_all(&stack, ":{line}:{col}").to_string();
    stack = QUERY_RE.replace_all(&stack, "?{query}").to_string();

    let summary = format!("{} {} {}", name, message, stack);
    let fingerprint = cal_md5(&summary);

    (fingerprint, summary)
}

fn cal_md5(res: &str) -> String {
  let digest = md5::compute(res.as_bytes());

  format!("{:x}", digest).to_uppercase()
}

fn get_string(map: &Map<String, Value>, key: &str) -> String {
    map.get(key)
       .and_then(|v| v.as_str())
       .unwrap_or_default()
       .to_string()
}


async fn run_flush(client: Client) {
    let mut ticker = interval(Duration::from_secs(10));
    // 丢掉默认的第一次执行
    ticker.tick().await;
    
    loop {
        ticker.tick().await;
        alert_flush(&client).await;
    }
}

pub async fn alert_flush(client: &Client) {
    debug!("数据刷新开始");
    let _ = collect_alert_fact(&client).await;
    let _ = collect_summary(&client).await;
    debug!("数据刷新完成")
}

async fn collect_summary(client: &Client) -> QueryResult<()> {
    for sm in SUMMARY_MAP.iter() {
        let app = sm.key();
        let summaries = &sm.value().summaries;
        let db = client.database(app);
        for summary in summaries.iter() {
            let value = summary.value();
            let page = value.page.clone().unwrap_or(json!(""));
            // 被标记为need_update时才会更新，所以delta必定大于0
            let update = doc! {
                "$setOnInsert": {
                    "fingerprint": value.fingerprint.clone(),
                    "summary": value.summary.clone(),
                    "name": value.name.clone(),
                    "message": value.message.clone(),
                    "page": page.as_str(),
                    "first_seen": value.first_seen,
                },
                "$set": {
                    "count": value.count,
                    "last_seen": value.last_seen
                }
            };
            alert_summary::Model::update_one(
                &db,
                doc! {
                    "fingerprint": &value.fingerprint,
                },
                update,
            ).await.unwrap();
        }

    }

    SUMMARY_MAP.clear();

    Ok(())
}

async fn collect_alert_fact(client: &Client) -> QueryResult<()> {
    let now = chrono::Utc::now();

    for fact in ALERT_MAP.iter() {
        let app = fact.key();
        let facts= &fact.value().map;
        let db = client.database(app);
        for mut fact in facts.iter_mut().filter(|f| f.need_update) {
            let value: &mut alert_fact::Model = fact.value_mut();
            debug!("插入告警事实{:?}", value);
            let update = doc! {
                "$setOnInsert": {
                    "fingerprint": value.fingerprint.clone(),
                },
                "$set": {
                    "count": value.count,
                    "strategy": value.strategy.to_string(),
                    "last_notify": value.last_notify,
                    "last_seen": value.last_seen,
                    "ttl": value.ttl,
                }
            };
            alert_fact::Model::update_one(
                &db,
                doc! {
                    "fingerprint": &value.fingerprint,
                },
                update,
            ).await.unwrap();
            value.need_update = false;
        }
        debug!("告警事实入库完成");

        let mut expire_fp = HashSet::new();
        facts.retain(|fp, v| {
            if let Some(ttl) = v.ttl {
                if let Some(notify) = v.last_notify {
                    let expired = is_expired(notify, ttl, Some(now));
                    if expired {
                        expire_fp.insert(fp.clone());
                    }
                    !expired
                } else {
                    true
                }
            } else {
                true
            }
        });
        debug!("活跃的告警事实{}", facts.len());
        debug!("过期指纹{:?}", expire_fp);

        // if let Some(fps) = FP_MAP.get_mut(app) {
        //     fps.retain(|fp| !expire_fp.contains(fp));
        //     debug!("活跃的指纹{}", fps.len());
        // }
    }

    Ok(())
}

/**
 * 判断时间是否过期
 */
fn is_expired(
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
