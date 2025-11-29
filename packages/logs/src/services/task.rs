use std::time::Duration;

use log::{info, error};
use rdkafka::producer::{BaseProducer, BaseRecord, Producer};

use crate::{model::logs_track, services::record_logs::RecordList};

pub fn send_to_kafka(
    producer: &BaseProducer,
    payload: &logs_track::Model
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
                info!("Message sent");
            }
            Err((kafka_err, join_err)) => {
                info!("Message failed to send: {}", kafka_err);
                info!("Error joining send task: {:?}", join_err);
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
            info!("start send track list");
            for payload in list {
                send_to_kafka(producer, payload);
            }
            let res = producer.flush(Duration::from_secs(10));
            if let Err(err) = res {
                error!("Error flushing producer: {}", err)
            }
        }
        _ => {
            info!("Not support batch send");
        }
    }

}
