use std::time::Duration;

use log::{debug, error, info};
use mongodb::Database;
use rdkafka::producer::{BaseProducer, BaseRecord, Producer};
use serde_json::Value;

use crate::{
    alert::{AlertRuleMap, RULE_MAP},
    model::{QueryModel, alert_rule, logs},
    services::{ServiceResult, record_logs::RecordList}
};

pub fn send_json_to_kafka(
    producer: &BaseProducer,
    topic: &str,
    payload: &Value,
) {
    let data = payload.to_string();
    let record = BaseRecord::to(topic)
        .key("notify")
        .payload(&data);
    let send_res = producer.send(record);

    match send_res {
        Ok(_) => {
            debug!("Message sent");
        }
        Err((kafka_err, join_err)) => {
            error!("Message failed to send: {}", kafka_err);
            error!("Error joining send task: {:?}", join_err);
        }
    }
}

pub fn send_to_kafka(
    producer: &BaseProducer,
    payload: &logs::Model
) {
    let session = payload.session.clone();
    let appid: String = payload.appid.clone();
    let data = serde_json::to_string(payload).unwrap();

    if let Some(session) = session {
        let key = format!("{}/{}", appid, session);
        let record = BaseRecord::to("rrweb")
            .key(&key)
            .payload(&data);
        let send_res = producer.send(record);

        match send_res {
            Ok(_) => {
                debug!("Message sent");
            }
            Err((kafka_err, join_err)) => {
                error!("Message failed to send: {}", kafka_err);
                error!("Error joining send task: {:?}", join_err);
            }
        }
    }
}

pub fn send_batch_to_kafka(
    producer: &BaseProducer,
    payloads: &RecordList
) {
    match payloads {
        RecordList::TrackList(list) => {
            if list.len() == 0 {
                return;
            }
            debug!("start send track list");
            for payload in list {
                send_to_kafka(producer, payload);
            }
            let res = producer.flush(Duration::from_secs(10));
            if let Err(err) = res {
                error!("Error flushing producer: {}", err)
            }
        }
        _ => {
            error!("Not support batch send");
        }
    }

}

pub async fn sync_alert_rule(
    db: &Database,
    app: &str,
) -> ServiceResult<()> {
    let rules = alert_rule::Model::find_all(&db).await?;
    RULE_MAP.insert(app.to_string(), AlertRuleMap::from_models(rules));
    info!("sync alert rule success");
    Ok(())
}
