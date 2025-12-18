use bson::{DateTime, doc};
use mongodb::{Client, Database};
use once_cell::sync::Lazy;
use regex::Regex;
use dashmap::{DashMap, DashSet};
use serde_json::{Value, Map};
use log::info;

use crate::model::{QueryBase, QueryModel, alert_fact, alert_rule::{self, AlertType}, history_error, logs, logs_error, logs_network};

type AppId = String;
type ErrorRaw = logs_error::Model;
type ApiRaw = logs_network::Model;
type LogRaw = logs::Model;
enum Raw {
    Error(ErrorRaw),
    Api(ApiRaw),
    Log(LogRaw)
}
type ErrorSummary = history_error::Model;
type AlertRule = QueryBase<alert_rule::Model>;

struct AppSummary {
    summaries: DashMap<String, ErrorSummary>,
}

type AlertFactInfo = alert_fact::Model ;
struct AlertFact {
    map: DashMap<String, AlertFactInfo>
}

pub static SUMMARY_MAP: Lazy<DashMap<AppId, AppSummary>> = Lazy::new(|| DashMap::new());
pub static FP_MAP: Lazy<DashMap<AppId, DashSet<String>>> = Lazy::new(|| DashMap::new());
pub static RULE_MAP: Lazy<DashMap<AppId, Vec<AlertRule>>> = Lazy::new(|| DashMap::new());
pub static ALERT_MAP: Lazy<DashMap<AppId, AlertFact>> = Lazy::new(|| DashMap::new());

static LINE_COL_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r":\d+:\d+").unwrap());
static QUERY_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\?[^)]*").unwrap());

pub async fn init(client: &Client) -> anyhow::Result<()> {
    info!("?");
    let apps: Vec<String> = client
        .list_database_names(None, None)
        .await?
        .into_iter()
        .filter(|name| name.starts_with("app_"))
        .collect();

    for app in apps {
        let db = client.database(&app);
        let rules = alert_rule::Model::find_all(&db).await?;
        RULE_MAP.insert(app.clone(), rules);

        let facts = alert_fact::Model::find_all(&db).await?;
        let fp_set= DashSet::new();
        let alert_fact_map = DashMap::new();

        for fact in &facts {
            if let Some(fp) = &fact.model.fingerprint {
                fp_set.insert(fp.clone());

                alert_fact_map.insert(fp.clone(), fact.model.clone());
            }
        }

        FP_MAP.insert(app.clone(), fp_set);
        let alert_fact = AlertFact {
            map: alert_fact_map,
        };
        ALERT_MAP.insert(app.clone(), alert_fact);
    }
    Ok(())
}

pub fn run(appid: &str, raw: &Raw) {
    match raw {
        Raw::Error(raw) => alert_error(appid, raw),
        Raw::Api(raw) => alert_api(appid, raw),
        Raw::Log(raw) => alert_log(appid, raw),
    };
}

pub fn alert_api(_appid: &str, _raw: &ApiRaw) {
    // TODO
}

pub fn alert_log(_appid: &str, _raw: &LogRaw) {
    // TODO
}

pub fn alert_error(appid: &str, raw: &ErrorRaw) {
    let (fp, summary)= normalize(raw);

    if let Some(rule) = check_alert(appid, &fp, AlertType::Error) {
        notify(&rule.model.notify, &summary);
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
        summary,
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

fn check_alert(appid: &str, fp: &String, log_type: AlertType) -> Option<AlertRule> {
    let rules = RULE_MAP.get(appid)?;
    let rule = rules
        .iter()
        .find(|r| r.model.fingerprint == Some(fp.to_string()))
        .or_else(|| rules.iter().find(|r| r.model.log_type == log_type))
        .cloned()?;

    let alert_fact = ALERT_MAP
        .entry(appid.to_string())
        .or_insert_with(|| AlertFact {
            map: DashMap::new(),
        });

    let now = DateTime::now();
    alert_fact.map
        .entry(fp.to_string())
        .and_modify(|s| {
            s.count += 1;
            s.last_seen = now;
        })
        .or_insert_with(|| AlertFactInfo {
            fingerprint: Some(fp.to_string()),
            count: 1,
            last_seen: now,
        });
    Some(rule)
}

fn notify(setting: &alert_rule::NotifySetting, summary: &String) {
    info!("notify summary with {:?} {}", setting, summary);
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
