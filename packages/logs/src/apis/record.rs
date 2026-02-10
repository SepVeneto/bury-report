use std::sync::Arc;
use log::debug;

use actix_web::{HttpRequest, post, web};
use flate2::read::GzDecoder;
use mongodb::{Client, Database};
use rdkafka::producer::BaseProducer;
use crate::model::logs::RecordPayload;
use crate::services::task::RawRecord;
use crate::services::task::send_raw_to_kafak;

use super::{ApiError, ApiResult};
use crate::services::record_logs;
use crate::services::Response;
use std::io::Read;

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
    producer: web::Data<Arc<BaseProducer>>,
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
            return Err(ApiError::ValidateError {
                err: e.to_string(),
                col: column!(),
                line: line!(),
                file: file!().to_string(),
            });
        }
    };

    match json {
        ProcessedPayload::JsonRecord(json) => {
            record_logs::record(&client, &db, &json, &producer, ip).await?;
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

    if body.is_empty() {
        return Err(ApiError::InvalidError());
    }

    if body[0] == 1 {
        let mut decoder = GzDecoder::new(&body[1..]);
        let mut decompressed = Vec::new();
        decoder.read_to_end(&mut decompressed)?;

        let record = serde_json::from_slice::<RecordPayload>(&decompressed)?;
        Ok(ProcessedPayload::JsonRecord(record))
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
        let record = serde_json::from_slice::<RecordPayload>(&body)?;
        Ok(ProcessedPayload::JsonRecord(record))
    }
}

fn decompress_gzip(data: &[u8]) -> Result<String, std::io::Error> {
  let mut decoder = flate2::read::GzDecoder::new(data);
  let mut decompressed_data = Vec::new();
  decoder.read_to_end(&mut decompressed_data)?;
  // 2. 尝试转为 String，使用 lossy 可以看到脏数据长什么样
  let result = String::from_utf8_lossy(&decompressed_data);
    
  println!("解压内容预览: {}", &result[..result.len().min(100)]);
  Ok(result.into_owned())
}
