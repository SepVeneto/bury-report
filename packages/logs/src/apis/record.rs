use actix_web::{get, post, web, HttpRequest};
use actix::Addr;
use log::error;
use logs::RecordPayload;
use mongodb::{Client, Database};
use crate::apis::get_appid;
use crate::db;

use super::{ApiError, ApiResult};
use crate::{model::*, services::record_logs};
use crate::services::{Response, actor::WsActor};

pub fn init_service(config: &mut web::ServiceConfig) {
  config.service(record_log);
  config.service(record_ws);
  config.service(record_error);
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
    svr: web::Data<Addr<WsActor>>,
    json_body: web::Payload,
) -> ApiResult {
    // default size limit 256KB
    let json = payload_handler(json_body).await?;
    record_logs::record(&client, &db, &json).await?;

    record_logs::send_to_ws(&svr, &json)?;

    Response::ok("", None).to_json()
}

#[get("/record/errors")]
async fn record_error(
    client: web::Data<Client>,
    req: HttpRequest,
    query: web::Query<QueryPayload>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let res = record_logs::get_error_list(&db, &query.0).await?;

    Response::ok(res, None).to_json()
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

    let json = serde_json::from_slice::<RecordPayload>(&res);

    match json {
        Ok(json) => Ok(json),
        Err(err) => {
            error!("Invalid JSON: {:?}", err);
            Err(ApiError::ValidateError { err: err.to_string(), col: column!(), line: line!(), file: file!().to_string() })
        }
    }
}
