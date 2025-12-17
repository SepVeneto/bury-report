use bson::DateTime;
use once_cell::sync::Lazy;
use regex::Regex;
use dashmap::{DashMap, DashSet};
use serde_json::{Value, Map};

use crate::model::{alert_rule, history_error, logs, logs_error, logs_network};

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
type AlertRule = alert_rule::Model;

struct AppSummary {
    summaries: DashMap<String, ErrorSummary>,
}

pub static SUMMARY_MAP: Lazy<DashMap<AppId, AppSummary>> = Lazy::new(|| DashMap::new());
pub static FP_MAP: Lazy<DashMap<AppId, DashSet<String>>> = Lazy::new(|| DashMap::new());
pub static RULE_MAP: Lazy<DashMap<AppId, AlertRule>> = Lazy::new(|| DashMap::new());

static LINE_COL_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r":\d+:\d+").unwrap());
static QUERY_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\?[^)]*").unwrap());

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

    // 标准化后根据指纹对摘要进行统计
    let is_new_fp = FP_MAP
        .entry(appid.to_string())
        .or_insert_with(|| DashSet::new())
        .insert(fp.clone());
    if is_new_fp {
        let summary = ErrorSummary {
            name: get_string(&raw.data, "name"),
            message: get_string(&raw.data, "message"),
            page: raw.data.get("page").cloned(),
            summary,
            fingerprint: fp.clone(),
            first_seen: DateTime::now(),
            last_seen: DateTime::now(),
            count: 1,
        };
        let app = SUMMARY_MAP
            .entry(appid.to_string())
            .or_insert_with(|| AppSummary {
                summaries: DashMap::new(),
            });
        app.summaries.insert(fp, summary);
    } else {
        let app = SUMMARY_MAP
            .entry(appid.to_string())
            .or_insert_with(|| AppSummary {
                summaries: DashMap::new(),
            });
        app.summaries
            .entry(fp.clone())
            .and_modify(|s| {
                s.count += 1;
                s.last_seen = DateTime::now();
            })
            .or_insert_with(|| ErrorSummary {
                name: get_string(&raw.data, "name"),
                message: get_string(&raw.data, "message"),
                page: raw.data.get("page").cloned(),
                summary,
                fingerprint: fp.clone(),
                first_seen: DateTime::now(),
                last_seen: DateTime::now(),
                count: 1,
            });
    }
}

fn check_alert(appid: &str, summary: &ErrorSummary) {
    let rules = RULE_MAP.get(appid);
    if let Some(rules) = rules {
        // 发送报警
        notify(&summary);
        rule.alert(summary)
    }
}

fn notify(setting: &alert_rule::NotifySetting, summary: &ErrorSummary) {
    if !setting.enabled {
        return;
    }

    summary.last_seen
    setting.frequency
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
