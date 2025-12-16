use std::collections::HashSet;

use once_cell::sync::Lazy;
use regex::Regex;
use dashmap::DashMap;
use serde_json::{Value, Map};

use crate::model::{alert_rule, history_error, logs_error};

type AppId = String;
type ErrorRaw = logs_error::Model;
type ErrorSummary = history_error::Model;
type AlertRule = alert_rule::Model;

pub static SUMMARY_MAP: Lazy<DashMap<AppId, ErrorSummary>> = Lazy::new(|| DashMap::new());
pub static FP_MAP: Lazy<DashMap<AppId, HashSet<String>>> = Lazy::new(|| DashMap::new());
pub static RULE_MAP: Lazy<DashMap<AppId, Vec<AlertRule>>> = Lazy::new(|| DashMap::new());

static LINE_COL_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r":\d+:\d+").unwrap());
static QUERY_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\?[^)]*").unwrap());

pub fn run(appid: &str, raw: &ErrorRaw) {
    let normalized = normalize(raw);
    let has_fp = check_fingerprint(appid, &normalized.fingerprint);

    if has_fp {

    } else {
        
    }
}

fn check_fingerprint(appid: &str, fp: &str) -> bool {
    let fp_list = FP_MAP.get(appid);
    if let Some(set) = fp_list {
        set.contains(fp)
    } else {
        let init: HashSet<String> = [fp.to_string()].into_iter().collect();
        FP_MAP.insert(appid.to_string(), init);
        false
    }
}

pub fn normalize(error: &ErrorRaw) -> ErrorSummary {
    let name = get_string(&error.data, "name");
    let message = get_string(&error.data, "message");
    let mut stack = get_string(&error.data, "stack");
    stack = LINE_COL_RE.replace_all(&stack, ":{line}:{col}").to_string();
    stack = QUERY_RE.replace_all(&stack, "?{query}").to_string();

    let extra = error.data.get("extra");
    let page = error.data.get("page");
    let summary = format!("{} {}", message, stack);
    let fingerprint = cal_md5(&summary);

    ErrorSummary {
        name,
        message,
        stack,
        extra: extra.cloned(),
        page: page.cloned(),
        fingerprint,
        summary,
    }
}

// 标准化后生成指纹
fn summary(message: &str, stack: &str) -> String {
    let str = format!("{} {}", message, stack);
    let md5 = cal_md5(&str);
    str
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
