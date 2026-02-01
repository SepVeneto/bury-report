use std::collections::HashSet;
use mongodb::{Client, bson::doc};
use tokio::time::{Duration, interval};
use log::debug;
use crate::{
    alert::{is_expired, model},
    model::{CreateModel, QueryResult, alert_fact, alert_rule::AlertStrategy, alert_summary}
};
use serde_json::json;

pub async fn run_flush(client: Client) {
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
    for sm in model::SUMMARY_MAP.iter() {
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
                doc! {
                    "fingerprint": &value.fingerprint,
                },
                update,
            ).await.unwrap();
        }

    }

    model::SUMMARY_MAP.clear();

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
                match v.strategy {
                    AlertStrategy::Window => {
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



