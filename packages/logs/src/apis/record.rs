use actix_web::{get, post, web, HttpRequest};
use actix::Addr;
use mongodb::Database;
use crate::apis::get_appid;

use super::ApiResult;
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

    let app = apps::Model::find_by_id(&db, &app_id).await?;
    if let None = app {
        return Err("找不到指定应用".into());
    }
    
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
    db: web::Data<Database>,
    svr: web::Data<Addr<WsActor>>,
    json_body: web::Json<logs::RecordPayload>,
) -> ApiResult {
    // default size limit 256KB
    record_logs::record(&db, &json_body).await?;

    record_logs::send_to_ws(&svr, &json_body)?;

    Response::ok("", None).to_json()
}

#[get("/record/errors")]
async fn record_error(
    db: web::Data<Database>,
    req: HttpRequest,
    query: web::Query<QueryPayload>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let res = record_logs::get_error_list(&db, &appid, &query.0).await?;

    Response::ok(res, None).to_json()
}
