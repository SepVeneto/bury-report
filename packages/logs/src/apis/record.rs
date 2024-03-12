use actix_web::{get, post, web, HttpRequest};
use actix::Addr;
use mongodb::Database;
use super::ApiResult;
use crate::{model::*, services::{record_logs, ServiceError}};
use crate::services::{Response, actor::WsActor};

pub fn init_service(config: &mut web::ServiceConfig) {
  config.service(record_log);
  config.service(record_ws);
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
        return Err(ServiceError::LogicError("找不到指定应用".to_owned()));
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
