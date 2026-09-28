use std::sync::atomic::{AtomicU64, Ordering};

use log::{debug, error, info};
use mongodb::Database;
use rdkafka::client::ClientContext;
use rdkafka::producer::{BaseProducer, BaseRecord, DeliveryResult, ProducerContext};
use serde_json::Value;

use crate::{
    alert::model::{AlertRuleMap, RULE_MAP},
    model::{QueryModel, alert_rule, logs},
    services::{ServiceResult, record_logs::RecordList, split},
};

/// 投递成功计数（交付回调）
pub static KAFKA_DELIVERED: AtomicU64 = AtomicU64::new(0);
/// 投递失败计数（交付回调，消息已被丢弃）
pub static KAFKA_DELIVERY_FAILED: AtomicU64 = AtomicU64::new(0);
/// 入队失败计数（本地队列满 / 单条超限），这类消息同样已丢
pub static KAFKA_ENQUEUE_FAILED: AtomicU64 = AtomicU64::new(0);
/// 因超过单条上限被拆分的 payload 数
pub static KAFKA_SPLIT: AtomicU64 = AtomicU64::new(0);

/// 生产者的自定义 context：把"交付失败"从静默变成可观测。
///
/// 默认 context 不接收交付回调，消息在 librdkafka 内部重试超时后会被直接丢弃，
/// 而客户端是 fire-and-forget（拿到 200 就清队列），所以不打点就等于永久失明。
pub struct ReportProducerContext;

impl ClientContext for ReportProducerContext {}

impl ProducerContext for ReportProducerContext {
    type DeliveryOpaque = ();

    fn delivery(&self, result: &DeliveryResult<'_>, _opaque: Self::DeliveryOpaque) {
        match result {
            Ok(_) => {
                KAFKA_DELIVERED.fetch_add(1, Ordering::Relaxed);
            }
            Err((err, _)) => {
                KAFKA_DELIVERY_FAILED.fetch_add(1, Ordering::Relaxed);
                error!("kafka 投递失败（该条数据已丢失）: {}", err);
            }
        }
    }
}

/// 本项目统一使用的生产者类型
pub type KafkaProducer = BaseProducer<ReportProducerContext>;

#[derive(Debug)]
pub struct RawRecord {
    pub appid: String,
    pub sessionid: String,
    pub data: Vec<u8>,
}

pub fn send_json_to_kafka(
    producer: &KafkaProducer,
    topic: &str,
    payload: &Value,
) {
    let data = payload.to_string();
    let record = BaseRecord::to(topic)
        .key("notify")
        .payload(&data);
    match producer.send(record) {
        Ok(_) => {
            debug!("Message sent");
        }
        Err((kafka_err, join_err)) => {
            KAFKA_ENQUEUE_FAILED.fetch_add(1, Ordering::Relaxed);
            error!("notify 入队失败（数据丢失）: {} / {:?}", kafka_err, join_err);
        }
    }
}

pub fn send_to_kafka(
    producer: &KafkaProducer,
    payload: &logs::Model
) {
    let session = payload.session.clone();
    let appid: String = payload.appid.clone();
    let data = match serde_json::to_string(payload) {
        Ok(data) => data,
        Err(err) => {
            error!("track 序列化失败（数据丢失）: {}", err);
            return;
        }
    };

    if let Some(session) = session {
        let key = format!("{}/{}", appid, session);
        let record = BaseRecord::to("rrweb")
            .key(&key)
            .payload(&data);
        match producer.send(record) {
            Ok(_) => {
                debug!("Message sent");
            }
            Err((kafka_err, join_err)) => {
                KAFKA_ENQUEUE_FAILED.fetch_add(1, Ordering::Relaxed);
                error!("track 入队失败（数据丢失）: {} / {:?}", kafka_err, join_err);
            }
        }
    }
}

pub fn send_batch_to_kafka(
    producer: &KafkaProducer,
    payloads: &RecordList
) {
    match payloads {
        RecordList::TrackList(list) => {
            if list.len() == 0 {
                return;
            }
            debug!("start send track list");
            // 注意：这里不能在请求路径上 flush。Kafka 抖动时 flush(10s) 会把整个 actix worker
            // 卡住（线上表现为 /record 处理耗时 10s+），ack/重试交给后台 poll 与交付回调负责。
            for payload in list {
                send_to_kafka(producer, payload);
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
    debug!("update rule {:?}", rules);
    RULE_MAP.insert(app.to_string(), AlertRuleMap::from_models(rules));
    info!("sync alert rule success");
    Ok(())
}

/// 二进制协议（gzip 后的 rrweb 事件流）投递。
/// 超过单条上限时先拆分——否则 librdkafka 会在入队时拒收，整段录屏直接丢。
pub async fn send_raw_to_kafak(
    producer: &KafkaProducer,
    raw: &RawRecord
) {
    let max_message_bytes = split::max_message_bytes();
    if raw.data.len() > max_message_bytes {
        match split::split_track_payload(&raw.data, max_message_bytes) {
            Ok(parts) if !parts.is_empty() => {
                KAFKA_SPLIT.fetch_add(1, Ordering::Relaxed);
                let total = parts.len();
                error!(
                    "track payload {} 字节超过单条上限 {}，已拆分为 {} 条消息投递（session={}）",
                    raw.data.len(), max_message_bytes, total, raw.sessionid
                );
                for (idx, part) in parts.into_iter().enumerate() {
                    send_track_bytes(producer, &raw.appid, &raw.sessionid, &part, Some((idx, total)));
                }
                return;
            }
            Ok(_) => {}
            Err(err) => {
                error!(
                    "track payload {} 字节超过单条上限 {} 且拆分失败（按原样投递，大概率被拒收）: {}",
                    raw.data.len(), max_message_bytes, err
                );
            }
        }
    }
    send_track_bytes(producer, &raw.appid, &raw.sessionid, &raw.data, None);
}

fn send_track_bytes(
    producer: &KafkaProducer,
    appid: &str,
    sessionid: &str,
    data: &[u8],
    split_hint: Option<(usize, usize)>,
) {
    let key = format!("{}/{}", appid, sessionid);
    let record = BaseRecord::to("rrweb")
        .key(&key)
        .payload(data);
    match producer.send(record) {
        Ok(_) => {
            debug!("track enqueued, size={} split={:?}", data.len(), split_hint);
        }
        Err((kafka_err, join_err)) => {
            KAFKA_ENQUEUE_FAILED.fetch_add(1, Ordering::Relaxed);
            error!(
                "track 入队失败（数据丢失）size={} split={:?}: {} / {:?}",
                data.len(), split_hint, kafka_err, join_err
            );
        }
    }
}
