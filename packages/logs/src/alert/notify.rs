use crate::{alert::{is_expired, model::{ALERT_MAP, AlertFact, AlertFactInfo, UnionRule}}, model::alert_rule::AlertNotify};
use bson::DateTime;
use dashmap::DashMap;
use log::debug;
use rdkafka::producer::BaseProducer;
use crate::services::task::send_json_to_kafka;
use serde_json::json;

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
            // 窗口期，但是第一次触发，会发送通知
            if fact.last_notify.is_none() {
                fact.last_notify = Some(now);
                true
            } else {
                if let Some(ttl) = fact.ttl {
                    // 滑动窗口，每次触发更新last_seen，ttl同样根据它计算
                    // 只有距最后一次出现超过ttl才会告警
                    // 窗口期内不触发
                    let expired = is_expired(fact.last_seen, ttl, Some(now.to_chrono()));
                    if expired {
                        fact.last_notify = Some(now);
                    }
                    expired
                } else {
                    fact.last_notify = Some(now);
                    // 原告警是其它规则，后来切换成窗口期触发
                    true
                }
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
    (need_notify, Some(fact.clone()))
}

pub fn trigger(
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

