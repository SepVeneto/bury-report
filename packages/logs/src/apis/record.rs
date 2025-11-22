use std::sync::Arc;

use actix_web::{get, post, web, HttpRequest};
use actix::Addr;
use flate2::read::GzDecoder;
use log::{error, info};
use mongodb::{Client, Database};
use rdkafka::producer::BaseProducer;
use serde::{Deserialize, Serialize};
use crate::apis::get_appid;
use crate::db;
use crate::model::logs::RecordPayload;
use crate::model::{ignore_empty_string, convert_to_i32};

use super::{ApiError, ApiResult, Query};
use crate::services::{device, record_logs};
use crate::services::{Response, actor::WsActor};
use std::io::Read;

pub fn init_service(config: &mut web::ServiceConfig) {
  config.service(record_log);
  config.service(record_ws);
  config.service(get_log);
  config.service(get_error);
  config.service(get_network);
  config.service(get_network_detail);
  config.service(get_device);
  config.service(get_device_list);
//   config.service(get_record_log);
}

#[get("/record/ws/{app_id}")]
async fn record_ws(
    path: web::Path<String>,
    db: web::Data<Database>,
    req: HttpRequest,
    stream: web::Payload,
    srv: web::Data<Addr<WsActor>>,
) -> ApiResult {
    let app_id = path.into_inner();

    record_logs::check_appid(&db, &app_id).await?;
    
    let resp = record_logs::create_ws(
        app_id,
        srv,
        &req,
        stream
    )?;
    Ok(resp)
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
    let is_gzip = if let Some(enc) = req.headers().get("Content-Encoding") {
        if enc.to_str().unwrap_or("") == "gzip" {
            true
        } else {
            false
        }
    } else {
        false
    };
    let json = payload_handler(json_body, true).await?;
    info!("Received log {:?}", json);
    let mut ip = None;
    if let Some(val) = req.headers().get("X-Real-IP") {
        ip = Some(val.to_str().unwrap_or("").to_string());
    }

    record_logs::record(&client, &db, &json, &producer, ip).await?;
    // record_logs::record(&client, &db, &json, ip).await?;

    // record_logs::send_to_ws(&svr, &json)?;

    Response::ok("", None).to_json()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LogFilter {
    #[serde(deserialize_with="ignore_empty_string", default)]
    pub uuid: Option<String>,
    pub session: Option<String>,
    pub r#type: Option<String>,
    pub data: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
}

#[get("/record/logs")]
async fn get_log(
    client: web::Data<Client>,
    req: HttpRequest,
    query: web::Query<Query<LogFilter>>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let res = record_logs::get_log_list(
        &db,
        query.0,
    ).await?;

    Response::ok(res, None).to_json()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorFilter {
    #[serde(deserialize_with="ignore_empty_string", default)]
    pub uuid: Option<String>,
    pub session: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
}

#[get("/record/errors")]
async fn get_error(
    client: web::Data<Client>,
    req: HttpRequest,
    query: web::Query<Query<ErrorFilter>>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let res = record_logs::get_error_list(
        &db,
        query.0,
    ).await?;

    Response::ok(res, None).to_json()
}

async fn payload_handler(payload: web::Payload, is_gzip: bool) -> anyhow::Result<RecordPayload, ApiError> {
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

    let json = serde_json::from_slice::<RecordPayload>(&bytes);

    match json {
        Ok(json) => Ok(json),
        Err(err) => {
            error!("Invalid JSON: {:?} with {:?}", err, res);
            Err(ApiError::ValidateError { err: err.to_string(), col: column!(), line: line!(), file: file!().to_string() })
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct FilterNetwork {
    #[serde(deserialize_with="ignore_empty_string", default)]
    pub uuid: Option<String>,
    #[serde(deserialize_with="ignore_empty_string", default)]
    pub session: Option<String>,
    #[serde(deserialize_with="ignore_empty_string", default)]
    pub url: Option<String>,
    #[serde(deserialize_with="ignore_empty_string", default)]
    pub send_page: Option<String>,
    #[serde(deserialize_with="ignore_empty_string", default)]
    pub payload: Option<String>,
    #[serde(deserialize_with="ignore_empty_string", default)]
    pub response: Option<String>,
    #[serde(deserialize_with="convert_to_i32", default)]
    pub status: Option<i32>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
}
#[get("/record/networks")]
async fn get_network(
    client: web::Data<Client>,
    req: HttpRequest,
    query: web::Query<Query<FilterNetwork>>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let res = record_logs::get_network_list(&db, query.0).await?;

    Response::ok(res, None).to_json()
}
#[get("/record/networks/{id}")]
async fn get_network_detail(
    client: web::Data<Client>,
    req: HttpRequest,
    path: web::Path<String>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let network_id = path.into_inner();
    let res = record_logs::get_network_detail(&db, network_id).await?;

    Response::ok(res, None).to_json()
}

// #[get("/record/logs")]
// async fn get_record_log(
//     client: web::Data<Client>,
//     req: HttpRequest,
//     query: web::Query<QueryPayload>,
// ) -> ApiResult {
//     let appid = get_appid(&req)?;
//     let db = db::DbApp::get_by_appid(&client, &appid);
//     let res = record_logs::get_log_list(&db, &query.0).await?;

//     Response::ok(res, None).to_json()
// }

#[get("/device/{id}")]
async fn get_device(
    client: web::Data<Client>,
    req: HttpRequest,
    path: web::Path<String>
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let device_id = path.into_inner();
    let res = device::get_device_by_uuid(&db, &device_id).await?;

    if let Some(device) = res{
        Response::ok(device, None).to_json()
    } else {
        Response::err(404, "设备不存在".to_string()).to_json()
    }
}


#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceFilter {
    #[serde(deserialize_with="ignore_empty_string", default)]
    pub uuid: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
}
#[get("/device")]
async fn get_device_list(
    client: web::Data<Client>,
    req: HttpRequest,
    query: web::Query<Query<DeviceFilter>>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let res = device::get_device_pagination(&db, query.0).await?;

    Response::ok(res, None).to_json()
}
