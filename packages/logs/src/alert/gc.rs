use std::collections::HashSet;
use std::sync::atomic::{AtomicI64, Ordering};
use mongodb::{Client, bson::doc};
use tokio::time::{Duration, interval};
use log::{debug, error};
use crate::{
    alert::{is_expired, model},
    model::{CreateModel, QueryResult, alert_fact, alert_rule::AlertStrategy, alert_summary}
};
use serde_json::json;

/// 最近一次成功完成一轮刷新的时间戳（秒），供看门狗判断循环是否卡住
static LAST_FLUSH_TS: AtomicI64 = AtomicI64::new(0);
/// 单轮刷新超时：超时放弃本轮（避免像线上那样卡在一个 await 上永不返回）
const FLUSH_TIMEOUT: Duration = Duration::from_secs(60);
const WATCHDOG_INTERVAL: Duration = Duration::from_secs(30);
const WATCHDOG_STUCK_SECS: i64 = 120;

fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

pub async fn run_flush(client: Client) {
    let mut ticker = interval(Duration::from_secs(10));
    // 丢掉默认的第一次执行
    ticker.tick().await;
    
    loop {
        ticker.tick().await;
        match tokio::time::timeout(FLUSH_TIMEOUT, alert_flush(&client)).await {
            Ok(()) => {
                LAST_FLUSH_TS.store(now_secs(), Ordering::Relaxed);
            }
            Err(_) => {
                // 超时后本轮 future 被丢弃，下一轮继续；关键是循环本身不会停
                error!("数据刷新超过 {}s 未完成，放弃本轮", FLUSH_TIMEOUT.as_secs());
            }
        }
    }
}

/// 独立看门狗：卡住的循环没法自己上报卡住，必须由外部任务发现
pub async fn run_watchdog() {
    let mut ticker = interval(WATCHDOG_INTERVAL);
    ticker.tick().await;
    loop {
        ticker.tick().await;
        let last = LAST_FLUSH_TS.load(Ordering::Relaxed);
        if last > 0 {
            let gap = now_secs() - last;
            if gap > WATCHDOG_STUCK_SECS {
                error!(
                    "聚合/回收循环已 {}s 未完成一轮（阈值 {}s），请检查 Mongo 与任务状态",
                    gap, WATCHDOG_STUCK_SECS
                );
            }
        }
    }
}

pub async fn alert_flush(client: &Client) {
    debug!("数据刷新开始");
    let _ = collect_alert_fact(&client).await;
    let _ = collect_summary(&client).await;
    debug!("数据刷新完成")
}

async fn collect_summary(client: &Client) -> QueryResult<()> {
    // 先把整个 app 的摘要取走（remove）再写库：
    // 写入期间新产生的摘要会进入新的 map，不会被 clear() 连带丢掉
    let apps: Vec<String> = model::SUMMARY_MAP
        .iter()
        .map(|entry| entry.key().clone())
        .collect();

    for app in apps {
        let app_summary = match model::SUMMARY_MAP.remove(&app) {
            Some((_, summary)) => summary,
            None => continue,
        };
        let db = client.database(&app);
        let fingerprints: Vec<String> = app_summary
            .summaries
            .iter()
            .map(|entry| entry.key().clone())
            .collect();
        for fingerprint in fingerprints {
            let value = match app_summary.summaries.remove(&fingerprint) {
                Some((_, value)) => value,
                None => continue,
            };
            let page = value.page.clone().unwrap_or(json!(""));
            let mut set = doc! {
                "message": value.message.clone(),
                "last_seen": value.last_seen,
            };
            // 只有本轮命中规则时才回填 rule_id，避免把上一轮的结果覆盖成 null
            if let Some(rule_id) = value.rule_id {
                set.insert("rule_id", rule_id);
            }
            // 被标记为need_update时才会更新，所以delta必定大于0
            let update = doc! {
                "$setOnInsert": {
                    "fingerprint": value.fingerprint.clone(),
                    "summary": value.summary.clone(),
                    "name": value.name.clone(),
                    "page": page.as_str(),
                    "first_seen": value.first_seen,
                },
                "$set": set,
                "$inc": {
                    "count": value.count,
                }
            };
            if let Err(err) = alert_summary::Model::update_one(
                &db,
                doc! {
                    "fingerprint": &value.fingerprint,
                },
                update,
            ).await {
                // 单条失败不能让整轮挂掉；把这条放回内存，下一轮重试，避免丢掉这一轮的计数
                error!("写入 history_error 失败 app={} fp={}（下轮重试）: {}", app, fingerprint, err);
                let entry = model::SUMMARY_MAP
                    .entry(app.clone())
                    .or_insert_with(|| model::AppSummary {
                        summaries: dashmap::DashMap::new(),
                    });
                if entry.summaries.len() < *crate::alert::MAX_SUMMARIES_PER_APP {
                    entry.summaries.insert(fingerprint.clone(), value);
                }
            }
        }
    }

    Ok(())
}

async fn collect_alert_fact(client: &Client) -> QueryResult<()> {
    let now = chrono::Utc::now();

    for fact in model::ALERT_MAP.iter() {
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
            if let Err(err) = alert_fact::Model::update_one(
                &db,
                doc! {
                    "fingerprint": &value.fingerprint,
                },
                update,
            ).await {
                // 保留 need_update=true，下一轮重试
                error!("写入 alert_fact 失败 app={} fp={}: {}", app, value.fingerprint, err);
                continue;
            }
            value.need_update = false;
        }
        debug!("告警事实入库完成");

        let mut expire_fp = HashSet::new();
        facts.retain(|fp, v| {
            if let Some(ttl) = v.ttl {
                match v.strategy {
                    AlertStrategy::Window => {
                        let expired = is_expired(v.last_seen, ttl, Some(now));
                        if expired {
                            expire_fp.insert(fp.clone());
                        }
                        !expired                       
                    },
                    AlertStrategy::Limit => {
                        let expired = is_expired(v.last_seen, ttl, Some(now));
                        if expired {
                            expire_fp.insert(fp.clone());
                        }
                        !expired                       
                    },
                    _ => {
                        if let Some(notify) = v.last_notify {
                            let expired = is_expired(notify, ttl, Some(now));
                            if expired {
                                expire_fp.insert(fp.clone());
                            }
                            !expired
                        } else {
                            true
                        }
                    }
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

