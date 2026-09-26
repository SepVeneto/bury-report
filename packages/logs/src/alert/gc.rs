use std::collections::HashSet;
use std::sync::atomic::{AtomicI64, Ordering};
use mongodb::{Client, bson::doc};
use tokio::{sync::Mutex, time::{Duration, interval}};
use log::{debug, error, info};
use crate::{
    alert::{is_expired, model},
    model::{CreateModel, QueryResult, alert_fact, alert_rule::AlertStrategy, alert_summary}
};
use serde_json::json;

static FLUSH_LOCK: Mutex<()> = Mutex::const_new(());

/// 最近一次成功完成刷新的时间戳（秒）。只用于看门狗报警，不参与任何取消逻辑。
static LAST_FLUSH_TS: AtomicI64 = AtomicI64::new(0);
/// 超过这么久没有成功刷新就报警
const WATCHDOG_STUCK_SECS: i64 = 180;

fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

/// 一轮刷新的写入统计
#[derive(Debug, Default, Clone, Copy)]
pub struct FlushStats {
    pub facts: usize,
    pub summaries: usize,
    pub failed: usize,
}

pub async fn run_flush(client: Client) {
    let mut ticker = interval(Duration::from_secs(10));
    // 丢掉默认的第一次执行
    ticker.tick().await;
    
    loop {
        ticker.tick().await;
        let started = std::time::Instant::now();
        // 注意：这里刻意不做 timeout —— 任何时候都不取消 driver 的 future
        match alert_flush(&client).await {
            Ok(stats) => {
                LAST_FLUSH_TS.store(now_secs(), Ordering::Relaxed);
                info!(
                    "[flush] 完成 用时={:?} fact={} summary={} 失败={}",
                    started.elapsed(), stats.facts, stats.summaries, stats.failed
                );
            }
            Err(err) => {
                error!("[flush] 失败 用时={:?}: {}", started.elapsed(), err);
            }
        }
    }
}

/// 看门狗：只观察和报警，绝不取消 driver 的 future
pub async fn run_watchdog() {
    let mut ticker = interval(Duration::from_secs(30));
    ticker.tick().await;
    loop {
        ticker.tick().await;
        let last = LAST_FLUSH_TS.load(Ordering::Relaxed);
        if last > 0 {
            let gap = now_secs() - last;
            if gap > WATCHDOG_STUCK_SECS {
                error!(
                    "[flush] 已 {}s 没有成功完成一轮（阈值 {}s），可能卡在 MongoDB 操作上",
                    gap, WATCHDOG_STUCK_SECS
                );
            }
        }
    }
}

pub async fn alert_flush(client: &Client) -> QueryResult<FlushStats> {
    let _flush_guard = FLUSH_LOCK.lock().await;
    flush_locked(client).await
}

/// 退出时使用：拿不到锁（说明已有一轮在跑）就直接跳过，
/// 既不等待也不取消，避免进程卡在退出阶段被 SIGKILL
pub async fn alert_flush_opportunistic(client: &Client) -> Option<QueryResult<FlushStats>> {
    match FLUSH_LOCK.try_lock() {
        Ok(_guard) => Some(flush_locked(client).await),
        Err(_) => None,
    }
}

async fn flush_locked(client: &Client) -> QueryResult<FlushStats> {
    debug!("数据刷新开始");
    let mut stats = FlushStats::default();
    // 两个 collector 都会执行；各自内部对单条失败只记日志并继续
    let (facts, facts_failed) = collect_alert_fact(client).await?;
    stats.facts = facts;
    stats.failed += facts_failed;
    let (summaries, summaries_failed) = collect_summary(client).await?;
    stats.summaries = summaries;
    stats.failed += summaries_failed;
    debug!("数据刷新完成: {:?}", stats);
    Ok(stats)
}

async fn collect_summary(client: &Client) -> QueryResult<(usize, usize)> {
    // Copy the cache before doing I/O so DashMap shard locks are never held
    // across an await. This also lets request handlers continue aggregating.
    let snapshots: Vec<(String, Vec<alert_summary::Model>)> = model::SUMMARY_MAP
        .iter()
        .map(|sm| (
            sm.key().clone(),
            sm.value().summaries.iter().map(|entry| entry.value().clone()).collect(),
        ))
        .collect();

    let mut written = 0usize;
    let mut failed = 0usize;

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
            if let Err(err) = alert_summary::Model::update_one(
                &db,
                doc! { "fingerprint": &value.fingerprint },
                update,
            ).await {
                // 单条失败只记日志并跳过：不让一个坏条目卡住整轮和后续 app
                failed += 1;
                error!("[flush] 写入 history_error 失败 app={} fp={}: {}", app, value.fingerprint, err);
                continue;
            }
            written += 1;

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

    Ok((written, failed))
}

async fn collect_alert_fact(client: &Client) -> QueryResult<(usize, usize)> {
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

    let mut written = 0usize;
    let mut failed = 0usize;

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
            if let Err(err) = alert_fact::Model::update_one(
                &db,
                doc! { "fingerprint": &value.fingerprint },
                update,
            ).await {
                failed += 1;
                error!("[flush] 写入 alert_fact 失败 app={} fp={}: {}", app, value.fingerprint, err);
                continue;
            }
            written += 1;

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

    Ok((written, failed))
}
