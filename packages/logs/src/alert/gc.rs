use std::collections::HashSet;
use mongodb::{Client, bson::doc};
use tokio::{sync::Mutex, time::{Duration, interval}};
use log::{debug, error};
use crate::{
    alert::{is_expired, model},
    model::{CreateModel, QueryResult, alert_fact, alert_rule::AlertStrategy, alert_summary}
};
use serde_json::json;

static FLUSH_LOCK: Mutex<()> = Mutex::const_new(());

pub async fn run_flush(client: Client) {
    let mut ticker = interval(Duration::from_secs(10));
    // 丢掉默认的第一次执行
    ticker.tick().await;
    
    loop {
        ticker.tick().await;
        if let Err(err) = alert_flush(&client).await {
            error!("告警缓存刷新失败，将在下个周期重试: {}", err);
        }
    }
}

pub async fn alert_flush(client: &Client) -> QueryResult<()> {
    let _flush_guard = FLUSH_LOCK.lock().await;
    debug!("数据刷新开始");
    let facts_result = collect_alert_fact(client).await;
    let summary_result = collect_summary(client).await;
    facts_result?;
    summary_result?;
    debug!("数据刷新完成");
    Ok(())
}

async fn collect_summary(client: &Client) -> QueryResult<()> {
    // Copy the cache before doing I/O so DashMap shard locks are never held
    // across an await. This also lets request handlers continue aggregating.
    let snapshots: Vec<(String, Vec<alert_summary::Model>)> = model::SUMMARY_MAP
        .iter()
        .map(|sm| (
            sm.key().clone(),
            sm.value().summaries.iter().map(|entry| entry.value().clone()).collect(),
        ))
        .collect();

    for (app, summaries) in snapshots {
        let db = client.database(&app);
        for value in summaries {
            let page = value.page.clone().unwrap_or(json!(""));
            let update = doc! {
                "$setOnInsert": {
                    "fingerprint": value.fingerprint.clone(),
                    "summary": value.summary.clone(),
                    "name": value.name.clone(),
                    "page": page.as_str(),
                    "first_seen": value.first_seen,
                },
                "$set": {
                    "rule_id": value.rule_id.clone(),
                    "message": value.message.clone(),
                    "last_seen": value.last_seen,
                },
                "$inc": {
                    "count": value.count,
                }
            };
            alert_summary::Model::update_one(
                &db,
                doc! { "fingerprint": &value.fingerprint },
                update,
            ).await?;

            // Subtract only the count included in this successful write. Events
            // recorded while MongoDB was processing it remain queued for the
            // next flush.
            if let Some(app_summary) = model::SUMMARY_MAP.get(&app) {
                if let Some(mut current) = app_summary.summaries.get_mut(&value.fingerprint) {
                    current.count = current.count.saturating_sub(value.count);
                    if current.count == 0 {
                        drop(current);
                        app_summary.summaries.remove(&value.fingerprint);
                    }
                }
            }
        }
    }

    Ok(())
}

async fn collect_alert_fact(client: &Client) -> QueryResult<()> {
    let now = chrono::Utc::now();
    let snapshots: Vec<(String, Vec<alert_fact::Model>)> = model::ALERT_MAP
        .iter()
        .map(|app| (
            app.key().clone(),
            app.value().map.iter()
                .filter(|fact| fact.need_update)
                .map(|fact| fact.value().clone())
                .collect(),
        ))
        .collect();

    for (app, facts_to_flush) in snapshots {
        let db = client.database(&app);
        for value in facts_to_flush {
            let update = doc! {
                "$setOnInsert": { "fingerprint": value.fingerprint.clone() },
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
                doc! { "fingerprint": &value.fingerprint },
                update,
            ).await?;

            if let Some(app_facts) = model::ALERT_MAP.get(&app) {
                if let Some(mut current) = app_facts.map.get_mut(&value.fingerprint) {
                    // Keep the dirty flag if a request changed this fact while
                    // the database write was in flight.
                    if current.count == value.count
                        && current.last_seen == value.last_seen
                        && current.last_notify == value.last_notify
                    {
                        current.need_update = false;
                    }
                }
            }
        }

        let mut expire_fp = HashSet::new();
        let mut active_count = 0;
        if let Some(app_facts) = model::ALERT_MAP.get(&app) {
            app_facts.map.retain(|fp, fact| {
                let expired = fact.ttl.map(|ttl| match fact.strategy {
                    AlertStrategy::Window | AlertStrategy::Limit => {
                        is_expired(fact.last_seen, ttl, Some(now))
                    }
                    _ => fact.last_notify
                        .map(|notify| is_expired(notify, ttl, Some(now)))
                        .unwrap_or(false),
                }).unwrap_or(false);
                if expired {
                    expire_fp.insert(fp.clone());
                }
                !expired
            });
            active_count = app_facts.map.len();
        }
        debug!("活跃的告警事实{}", active_count);
        debug!("过期指纹{:?}", expire_fp);
    }

    Ok(())
}
