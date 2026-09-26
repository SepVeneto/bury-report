use std::sync::Arc;
use log::{debug, error, warn};

use actix_web::{HttpRequest, post, web};
// use flate2::read::GzDecoder;
use mongodb::{Client, Database};
use crate::services::task::KafkaProducer;
use crate::model::logs::RecordPayload;
use crate::services::task::RawRecord;
use crate::services::task::send_raw_to_kafak;

use super::{ApiError, ApiResult};
use crate::services::record_logs;
use crate::services::Response;
// use std::io::Read;

/// 请求体上限（与 PayloadConfig 一致，但这里是真正生效的那一道）
fn max_body_size() -> usize {
  env_usize("MAX_BODY_BYTES", 10 * 1024 * 1024)
}
/// 单批上报条数上限：防止一个包塞几万条把内存顶到峰值。
/// 官方 SDK 是按 48KB 分片的（浏览器/worker）或整队列最多 50 条（小程序），正常情况下远达不到。
fn max_batch_items() -> usize {
  env_usize("MAX_BATCH_ITEMS", 5000)
}
fn env_usize(key: &str, default: usize) -> usize {
  std::env::var(key).ok().and_then(|v| v.parse().ok()).unwrap_or(default)
}

#[derive(Debug)]
enum ProcessedPayload {
    JsonRecord(RecordPayload),
    RawData(RawRecord),
}

pub fn init_service(config: &mut web::ServiceConfig) {
  config.service(record_log);
}


#[post("/record")]
async fn record_log(
    client: web::Data<Client>,
    db: web::Data<Database>,
    req: HttpRequest,
    producer: web::Data<Arc<KafkaProducer>>,
    // svr: web::Data<Addr<WsActor>>,
    json_body: web::Payload,
) -> ApiResult {
    // default size limit 256KB
    // 10MB
    let mut ip = None;
    if let Some(val) = req.headers().get("X-Real-IP") {
        ip = Some(val.to_str().unwrap_or("").to_string());
    }
    let json = match payload_handler(json_body).await {
        Ok(json) => json,
        Err(e) => {
            debug!("json error: {:?}", e);
            // 直接透传：不要把 InvalidError(400) 又包成 ValidateError
            return Err(e);
        }
    };

    match json {
        ProcessedPayload::JsonRecord(json) => {
            let appid = json.get_appid();
            if let Err(err) = record_logs::record(&client, &db, &json, &producer, ip).await {
                // 客户端是 no-cors/不校验 statusCode，看不到这个错误，必须在服务端留下明确日志
                error!("record 处理失败 appid={}（客户端不可见）: {}", appid, err);
                return Err(err.into());
            }
        },
        ProcessedPayload::RawData(raw) => {
            send_raw_to_kafak(&producer, &raw).await;
        }
    }


    Response::ok("", None).to_json()
}

async fn payload_handler(payload: web::Payload) -> Result<ProcessedPayload, ApiError> {
    let body = payload.to_bytes().await.map_err(|e| ApiError::ValidateError {
        err: e.to_string(),
        col: column!(),
        line: line!(),
        file: file!().to_string(),
    })?;

    let limit = max_body_size();
    if body.len() > limit {
        warn!(
            "请求体超限被拒绝: {} 字节 > {} 字节（客户端看不到 413，这部分数据会丢）",
            body.len(), limit
        );
        return Err(ApiError::PayloadTooLarge {
            size: body.len(),
            limit,
        });
    }

    if body.is_empty() {
        return Err(ApiError::InvalidError());
    }

    if body[0] == 1 {
        return Err(ApiError::InvalidError());
    } else if body[0] == 0 {
        let protocol_data = &body[1..];

        let pipe_pos = protocol_data
            .iter()
            .position(|&b| b == b'|')
            .ok_or(ApiError::InvalidError())?;

        let colon_pos = protocol_data
            .iter()
            .position(|&b| b == b':')
            .ok_or(ApiError::InvalidError())?;

        let session_id = std::str::from_utf8(&protocol_data[..colon_pos])
            .map_err(|_| ApiError::InvalidError())?
            .to_string();

        let app_id = std::str::from_utf8(&protocol_data[colon_pos + 1..pipe_pos])
            .map_err(|_| ApiError::InvalidError())?
            .to_string();
        
        let data = protocol_data[pipe_pos + 1..].to_vec();

    //    let raw_str = decompress_gzip(&data)?;

        Ok(ProcessedPayload::RawData(RawRecord {
            appid: app_id,
            sessionid: session_id,
            data,
        }))
    } else {
        let record = serde_json::from_slice::<RecordPayload>(&body).map_err(|e| {
            ApiError::ValidateError {
                err: e.to_string(),
                col: column!(),
                line: line!(),
                file: file!().to_string(),
            }
        })?;
        if let RecordPayload::V2(v2) = &record {
            let max_items = max_batch_items();
            if v2.data.len() > max_items {
                warn!(
                    "单批条数超限被拒绝: {} > {}（appid={}，客户端看不到 400，这部分数据会丢）",
                    v2.data.len(), max_items, v2.appid
                );
                return Err(ApiError::ValidateError {
                    err: format!("单批条数 {} 超过上限 {}", v2.data.len(), max_items),
                    col: column!(),
                    line: line!(),
                    file: file!().to_string(),
                });
            }
        }
        Ok(ProcessedPayload::JsonRecord(record))
    }
}

// fn decompress_gzip(data: &[u8]) -> Result<String, std::io::Error> {
//   let mut decoder = flate2::read::GzDecoder::new(data);
//   let mut decompressed_data = Vec::new();
//   decoder.read_to_end(&mut decompressed_data)?;
//   // 2. 尝试转为 String，使用 lossy 可以看到脏数据长什么样
//   let result = String::from_utf8_lossy(&decompressed_data);
    
//   println!("解压内容预览: {}", &result[..result.len().min(100)]);
//   Ok(result.into_owned())
// }
