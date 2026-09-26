//! 超过单条 Kafka 上限的 track payload 拆分。
//!
//! 背景：客户端会把多批 rrweb 事件合并成一个 gzip payload（重试缓冲叠加后很容易到几 MB ~ 十几 MB），
//! 一旦超过 producer 的 `message.max.bytes`，librdkafka 会在**入队**时就拒收（MSG_SIZE_TOO_LARGE），
//! 而客户端按 fire-and-forget 早已清掉自己的队列 —— 整段录屏静默丢失。
//!
//! 这里在投递前按体积对半递归拆分，保证每条消息都低于上限。拆分只改变"一条消息里装多少事件"，
//! 不改变 payload 结构（始终是 record 数组），消费端仍可按 session + 事件时间戳合并；
//! 每个拆分出的记录会带上 `part` 序号，便于排查与去重。

use anyhow::Result;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use log::debug;
use serde_json::{json, Value};
use std::io::{Read, Write};

/// 递归拆分的最大深度：2^6 = 最多 64 片，避免病态输入把 CPU 打满
const MAX_SPLIT_DEPTH: usize = 6;
/// 未压缩体积与 gzip 体积的经验比值，用于估算拆分预算（避免每片都压一遍）
const COMPRESS_RATIO: usize = 8;

/// 单条 Kafka 消息上限。必须与 broker/主题侧的上限对齐：
/// Redpanda 的 `kafka_batch_max_bytes` 默认只有 1MiB，超过会在 broker 侧被拒。
pub fn max_message_bytes() -> usize {
  std::env::var("KAFKA_MAX_MESSAGE_BYTES")
    .ok()
    .and_then(|v| v.parse().ok())
    .unwrap_or(10 * 1024 * 1024)
}

pub fn gzip_bytes(data: &[u8]) -> Result<Vec<u8>> {
  let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
  encoder.write_all(data)?;
  Ok(encoder.finish()?)
}

pub fn gunzip_string(data: &[u8]) -> Result<String> {
  let mut decoder = GzDecoder::new(data);
  let mut out = String::new();
  decoder.read_to_string(&mut out)?;
  Ok(out)
}

fn json_len(value: &Value) -> usize {
  serde_json::to_vec(value).map(|v| v.len()).unwrap_or(usize::MAX)
}

/// 拆分已经 gzip 的 track payload。
/// - 返回空 vec 表示"不需要拆分"，调用方按原样投递；
/// - 解析/解压失败时返回 Err，调用方按原样投递（保持旧行为，不影响主链路）。
pub fn split_track_payload(
  data: &[u8],
  max_message_bytes: usize,
) -> Result<Vec<Vec<u8>>> {
  let json = gunzip_string(data)?;
  let value: Value = serde_json::from_str(&json)?;

  // 未压缩预算：按经验压缩比估算，避免为了判断体积把每片都压一次
  let budget = max_message_bytes.saturating_mul(COMPRESS_RATIO);
  let mut parts: Vec<Value> = Vec::new();
  split_value(value, budget, 0, &mut parts);
  if parts.len() <= 1 {
    return Ok(vec![]);
  }

  let total = parts.len();
  let mut out = Vec::with_capacity(total);
  for (idx, mut part) in parts.into_iter().enumerate() {
    mark_part(&mut part, idx);
    out.push(gzip_bytes(&serde_json::to_vec(&part)?)?);
  }
  debug!("track payload 超过单条上限，已拆分为 {} 条消息", total);
  Ok(out)
}

/// 给拆分出来的记录打上分段序号（payload 结构不变，只多一个 `part` 字段），
/// 便于排查与消费端识别"这是被服务端拆开的一段"。
fn mark_part(value: &mut Value, idx: usize) {
  match value {
    Value::Array(list) => {
      for item in list.iter_mut() {
        if let Some(obj) = item.as_object_mut() {
          obj.insert("part".to_string(), json!(idx));
        }
      }
    }
    Value::Object(obj) => {
      obj.insert("part".to_string(), json!(idx));
    }
    _ => {}
  }
}

fn split_value(value: Value, budget: usize, depth: usize, out: &mut Vec<Value>) {
  if json_len(&value) <= budget || depth >= MAX_SPLIT_DEPTH {
    out.push(value);
    return;
  }

  match value {
    // 多条记录：按记录数对半切
    Value::Array(mut list) if list.len() > 1 => {
      let mid = list.len() / 2;
      let right = list.split_off(mid);
      split_value(Value::Array(list), budget, depth + 1, out);
      split_value(Value::Array(right), budget, depth + 1, out);
    }
    // 只剩一条记录却仍然超限：按 data.events 对半切，保持 record 外壳不变
    Value::Array(mut list) => {
      if let Some(record) = list.pop() {
        split_record(record, budget, depth, out);
      }
    }
    other => out.push(other),
  }
}

fn split_record(record: Value, budget: usize, depth: usize, out: &mut Vec<Value>) {
  let events = record
    .pointer("/data/events")
    .and_then(|v| v.as_array())
    .cloned()
    .unwrap_or_default();

  if events.len() < 2 {
    // 单条事件都无法压到预算内：原样发出，交给调用方计数告警，避免无限递归
    out.push(Value::Array(vec![record]));
    return;
  }

  let mid = events.len() / 2;
  for half in [&events[..mid], &events[mid..]] {
    let mut part = record.clone();
    if let Some(slot) = part.pointer_mut("/data/events") {
      *slot = Value::Array(half.to_vec());
    }
    split_value(Value::Array(vec![part]), budget, depth + 1, out);
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn event(size: usize) -> Value {
    json!({ "type": 3, "timestamp": 1, "data": { "blob": "x".repeat(size) } })
  }

  fn record(events: Vec<Value>) -> Value {
    json!({
      "type": "__BR_TRACK__",
      "session": "s-1",
      "uuid": "u-1",
      "stamp": 1,
      "data": { "events": events },
    })
  }

  fn payload(records: Vec<Value>) -> Vec<u8> {
    gzip_bytes(&serde_json::to_vec(&Value::Array(records)).unwrap()).unwrap()
  }

  #[test]
  fn small_payload_is_not_split() {
    let data = payload(vec![record(vec![event(16)])]);
    let parts = split_track_payload(&data, 1024 * 1024).unwrap();
    assert!(parts.is_empty(), "小包不应被拆分");
  }

  #[test]
  fn many_records_are_split_and_keep_shape() {
    // 100 条记录，每条 64KB 事件，预算 256KB（未压缩预算 2MB）
    let records = (0..100).map(|_| record(vec![event(64 * 1024)])).collect();
    let data = payload(records);
    let parts = split_track_payload(&data, 256 * 1024).unwrap();

    assert!(parts.len() > 1, "应该被拆成多条");
    let mut restored = 0usize;
    for part in &parts {
      assert!(
        part.len() <= 256 * 1024 + 4096,
        "拆分后单条 gzip 体积应在预算内: {}",
        part.len()
      );
      let value: Value = serde_json::from_str(&gunzip_string(part).unwrap()).unwrap();
      let list = value.as_array().expect("拆分后仍是 record 数组");
      restored += list.len();
      assert!(list.iter().all(|item| item.get("part").is_some()));
    }
    assert_eq!(restored, 100, "记录不能丢");
  }

  #[test]
  fn oversized_single_record_is_split_by_events() {
    // 单条记录内含 400 个事件，整体远超预算
    let data = payload(vec![record((0..400).map(|_| event(32 * 1024)).collect())]);
    let parts = split_track_payload(&data, 256 * 1024).unwrap();

    assert!(parts.len() > 1);
    let mut events_total = 0usize;
    for part in &parts {
      let value: Value = serde_json::from_str(&gunzip_string(part).unwrap()).unwrap();
      let list = value.as_array().unwrap();
      assert_eq!(list.len(), 1, "单记录拆分后仍是单记录");
      events_total += list[0]
        .pointer("/data/events")
        .and_then(|v| v.as_array())
        .map(|v| v.len())
        .unwrap_or(0);
    }
    assert_eq!(events_total, 400, "事件不能丢");
  }

  #[test]
  fn invalid_payload_returns_error() {
    assert!(split_track_payload(b"not-gzip", 1024).is_err());
  }
}
