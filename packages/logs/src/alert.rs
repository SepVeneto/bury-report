use std::collections::HashSet;

use bson::DateTime;
use mongodb::{Client, bson::doc};
use once_cell::sync::Lazy;
use rdkafka::producer::BaseProducer;
use regex::Regex;
use dashmap::{DashMap, DashSet};
use serde_json::{Value, Map, json};
use log::{debug, error, info};
use tokio::time::{Duration, interval};

use crate::model::{CreateModel, QueryBase, QueryModel, QueryResult, alert_fact, alert_rule::{self, AlertType}, alert_summary, logs, logs_error, logs_network};
use crate::services::task::send_json_to_kafka;

type AppId = String;
type ErrorRaw = logs_error::Model;
type ApiRaw = logs_network::Model;
type LogRaw = logs::Model;
enum Raw {
    Error(ErrorRaw),
    Api(ApiRaw),
    Log(LogRaw)
}
type ErrorSummary = alert_summary::Model;
type AlertRule = QueryBase<alert_rule::Model>;

struct AppSummary {
    summaries: DashMap<String, ErrorSummary>,
}

type AlertFactInfo = alert_fact::Model ;
struct AlertFact {
    map: DashMap<String, AlertFactInfo>
}

static SUMMARY_MAP: Lazy<DashMap<AppId, AppSummary>> = Lazy::new(|| DashMap::new());

pub static RULE_MAP: Lazy<DashMap<AppId, Vec<AlertRule>>> = Lazy::new(|| DashMap::new());
static ALERT_MAP: Lazy<DashMap<AppId, AlertFact>> = Lazy::new(|| DashMap::new());
pub static FP_MAP: Lazy<DashMap<AppId, DashSet<String>>> = Lazy::new(|| DashMap::new());

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
        info!("初始化规则{}条", rules.len());
        RULE_MAP.insert(app.clone(), rules);

        let facts = alert_fact::Model::find_all(&db).await.unwrap();
        let fp_set= DashSet::new();
        let alert_fact_map = DashMap::new();

        for fact in &facts {
            if let Some(fp) = &fact.model.fingerprint {
                fp_set.insert(fp.clone());

                let data = AlertFactInfo {
                    fingerprint: Some(fp.clone()),
                    ttl: fact.model.ttl,
                    last_seen: fact.model.last_seen,
                    need_update: false,
                    count: fact.model.count,
                    flush_count: 0,
                };

                alert_fact_map.insert(fp.clone(), data);
            }
        }

        info!("初始化指纹{}条", fp_set.len());
        FP_MAP.insert(app.clone(), fp_set);
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

// pub fn run(appid: &str, raw: &Raw) {
//     match raw {
//         Raw::Error(raw) => alert_error(appid, raw),
//         Raw::Api(raw) => alert_api(appid, raw),
//         Raw::Log(raw) => alert_log(appid, raw),
//     };
// }

pub fn alert_api(_appid: &str, _raw: &ApiRaw) {
    // TODO
}

pub fn alert_log(_appid: &str, _raw: &LogRaw) {
    // TODO
}

pub fn alert_error(producer: &BaseProducer, appid: &str, raw: &ErrorRaw) {
    let appid = format!("app_{}", appid);
    let fp = &raw.fingerprint;
    let summary = &raw.summary;

    debug!(target: "alert","{}: 指纹{}", summary, fp);

    if let Some((rule, fact)) = check_alert(&appid, &fp, AlertType::Error) {
        // 第一次出现或在告警窗口内才会通知
        if fact.count == 1 || is_expired(fact.last_seen, fact.ttl, None) {
            notify(producer, &rule, &summary);
        }
    }

    let _is_new_fp = FP_MAP
        .entry(appid.to_string())
        .or_insert_with(|| DashSet::new())
        .insert(fp.clone());

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

fn check_alert(
    appid: &str,
    fp: &String,
    log_type: AlertType
) -> Option<(AlertRule, AlertFactInfo)> {
    let rules = RULE_MAP.get(appid)?;
    let rule = rules
        .iter()
        .find(|r| r.model.fingerprint == Some(fp.to_string()))
        .or_else(|| rules.iter().find(|r| r.model.log_type == log_type))
        .cloned()?;

    debug!(target: "alert", "命中规则{}", rule._id);

    let alert_fact = ALERT_MAP
        .entry(appid.to_string())
        .or_insert_with(|| AlertFact {
            map: DashMap::new(),
        });

    let now = DateTime::now();

    let alert_fact_entry = AlertFactInfo {
        fingerprint: Some(fp.to_string()),
        ttl: rule.model.notify.frequency.window_sec,
        last_seen: now,
        need_update: true,
        count: 1,
        flush_count: 1,
    };

    let current_fact = alert_fact.map
        .entry(fp.to_string())
        .and_modify(|s| {
            s.flush_count += 1;
            s.ttl = rule.model.notify.frequency.window_sec;
            s.last_seen = now;
            s.need_update = true;
        })
        .or_insert(alert_fact_entry);
    Some((rule, current_fact.value().clone()))
}

fn notify(producer: &BaseProducer, rule: &AlertRule, summary: &String) {
    let url = &rule.model.notify.url;
    let data = json!({
        "url": url,
        "name": rule.model.name,
        "type": rule.model.log_type,
        "rule": rule.model.notify.frequency,
        "content": summary,
    });
    debug!("发送通知{:?}", data);
    send_json_to_kafka(producer, "notify", &data);
}

pub fn normalize(error: &ErrorRaw) -> (String, String) {
    let message = get_string(&error.data, "message");
    let mut stack = get_string(&error.data, "stack");
    stack = LINE_COL_RE.replace_all(&stack, ":{line}:{col}").to_string();
    stack = QUERY_RE.replace_all(&stack, "?{query}").to_string();

    let summary = format!("{} {}", message, stack);
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
                "$inc": { "count": value.count },
                "$set": { "last_seen": value.last_seen }
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
            // 被标记为need_update时才会更新，所以delta必定大于0
            let update = doc! {
                "$setOnInsert": {
                    "fingerprint": value.fingerprint.clone(),
                },
                "$inc": { "count": value.flush_count},
                "$set": {
                    "last_seen": value.last_seen,
                    "ttl": value.ttl,
                }
            };
            value.count += value.flush_count;
            value.flush_count = 0;
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
            let expired = is_expired(v.last_seen, v.ttl, Some(now));
            if expired {
                expire_fp.insert(fp.clone());
            }
            !expired
        });
        debug!("活跃的告警事实{}", facts.len());
        debug!("过期指纹{:?}", expire_fp);

        if let Some(fps) = FP_MAP.get_mut(app) {
            fps.retain(|fp| !expire_fp.contains(fp));
            debug!("活跃的指纹{}", fps.len());
        }
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
