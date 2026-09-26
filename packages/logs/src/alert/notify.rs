use crate::{alert::{is_expired, MAX_FACTS_PER_APP, model::{ALERT_MAP, AlertFact, AlertFactInfo, UnionRule}}, model::alert_rule::AlertNotify};
use bson::DateTime;
use dashmap::DashMap;
use log::{debug, warn};
use crate::services::task::KafkaProducer;
use crate::services::task::send_json_to_kafka;
use serde_json::json;

/// Once 策略的事实在内存里保留 7 天
const ONCE_TTL_SECS: i64 = 60 * 60 * 24 * 7;

pub fn check_notify(
    rule: &UnionRule,
    appid: &str,
    fp: &str
) -> (bool, Option<AlertFactInfo>) {
    if rule.url().is_none() {
        return (false, None);
    }

    let alert_fact = ALERT_MAP 
        .entry(appid.to_string())
        .or_insert_with(|| AlertFact {
            map: DashMap::new(),
        });

    if alert_fact.map.len() >= *MAX_FACTS_PER_APP && !alert_fact.map.contains_key(fp) {
        warn!("应用 {} 告警事实超过上限 {}，丢弃新指纹 {}", appid, *MAX_FACTS_PER_APP, fp);
        return (false, None);
    }

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

    // 记录上一次出现时间：Limit 策略需要用它判断窗口是否重新开始
    let mut prev_seen: Option<DateTime> = None;

    let mut fact = alert_fact.map
        .entry(fp.to_string())
        .and_modify(|s| {
            prev_seen = Some(s.last_seen);
            s.last_seen = now;
            s.need_update = true;
            s.strategy = rule.strategy();
            // 只有本规则真的带 ttl 时才覆盖：Once 的 rule.ttl() 为 None，
            // 之前会把它第一次写入的 7 天清成 None，导致该 fact 永不回收（内存只增不减）
            if let Some(ttl) = rule.ttl() {
                s.ttl = Some(ttl);
            }
            s.count += 1;
        })
        .or_insert(alert_fact_entry);

    let need_notify = match rule.notify() {
        AlertNotify::Once { .. } => {
            if fact.last_notify.is_none() {
                fact.last_notify = Some(now);
                // TODO: 统一控制
                // 仅一次告警有7天的TTL
                fact.ttl = Some(ONCE_TTL_SECS);
                true
            } else {
                false
            }
        },
        AlertNotify::Window { window_sec, .. } => {
            // 距上一次"触发"超过 window_sec 才允许再次触发。
            // 用 last_notify 而不是 last_seen：后者在检查前刚被刷新，等于永远不满足。
            let expired = match fact.last_notify {
                Some(last) => is_expired(last, window_sec, Some(now.to_chrono())),
                None => true,
            };
            if expired {
                fact.last_notify = Some(now);
            }
            expired
        },
        AlertNotify::Limit { limit, window_sec, .. } => {
            // 本窗口内已经推送过则直接跳过（节流）
            let out_of_window = match fact.last_notify {
                Some(last) => is_expired(last, window_sec, Some(now.to_chrono())),
                None => true,
            };
            let trigger = if !out_of_window {
                false
            } else {
                let new_window = match prev_seen {
                    Some(prev) => is_expired(prev, window_sec, Some(now.to_chrono())),
                    None => true,
                };
                if new_window || fact.flush_count == 0 {
                    fact.flush_count = 1;
                } else {
                    fact.flush_count += 1;
                }
                fact.flush_count >= limit
            };
            debug!("limit {limit}, window {window_sec}s, count {count}", limit = limit, window_sec = window_sec, count = fact.flush_count);
            if trigger {
                fact.last_notify = Some(now);
                // 清零计数，等窗口过期后重新累计
                fact.flush_count = 0;
            }
            trigger
        }
    };
    (need_notify, Some(fact.clone()))
}

pub fn trigger(
    producer: &KafkaProducer,
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
