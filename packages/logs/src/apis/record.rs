use std::sync::Arc;

use actix_web::{HttpRequest, post, web};
use flate2::read::GzDecoder;
use log::error;
use mongodb::{Client, Database};
use rdkafka::producer::BaseProducer;
use crate::model::logs::RecordPayload;

use super::{ApiError, ApiResult};
use crate::services::record_logs;
use crate::services::Response;
use std::io::Read;

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
    let json = payload_handler(json_body).await?;
    let mut ip = None;
    if let Some(val) = req.headers().get("X-Real-IP") {
        ip = Some(val.to_str().unwrap_or("").to_string());
    }

    record_logs::record(&client, &db, &json, &producer, ip).await?;

    Response::ok("", None).to_json()
}

async fn payload_handler(payload: web::Payload) -> anyhow::Result<RecordPayload, ApiError> {
    let res = match payload.to_bytes().await {
        Ok(res) => res,
        Err(err) => { return Err(ApiError::ValidateError {
            err: err.to_string(),
            col: column!(),
            line: line!(),
            file: file!().to_string(),
        }); }
    };

    let bytes = if let Some((is_gzip, bytes)) = res.split_first() {
        if *is_gzip == 1 {
            let mut decoder = GzDecoder::new(&bytes[..]);
            let mut decompressed: Vec<u8> = Vec::new();
            let _ = decoder.read_to_end(&mut decompressed);
            decompressed
        } else {
            res.to_vec()
        }
    } else {
        res.to_vec()
    };

    if &bytes == b"" {
        return Err(ApiError::InvalidError());
    }

    let json = serde_json::from_slice::<RecordPayload>(&bytes);

    match json {
        Ok(json) => Ok(json),
        Err(err) => {
            let str = std::str::from_utf8(&bytes).unwrap_or("");
            error!("Invalid JSON: {:?} with {:?}", err, str);
            Err(ApiError::ValidateError { err: err.to_string(), col: column!(), line: line!(), file: file!().to_string() })
        }
    }
}
