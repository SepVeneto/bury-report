use actix::Addr;
use actix_web::{web, HttpRequest, HttpResponse};
use actix_web_actors::ws;
use mongodb::Database;
use anyhow::anyhow;

use crate::model::{
    apps,
    logs::{Model, RecordPayload},
    PaginationResult,
    QueryPayload,
};

use super::{actor::{LogMessage, WsActor}, ws::WebsocketConnect, ServiceError, ServiceResult};

pub async fn check_appid(db: &Database, appid: &str) -> ServiceResult<bool> {
    let app = apps::Model::find_by_id(&db, appid).await?;
    if let None = app {
        Err(anyhow!("找不到指定应用").into())
    } else {
        Ok(true)
    }
}
pub async fn record(db: &Database, data: &RecordPayload) -> ServiceResult<()> {
    let appid = data.get_appid();
    let app = apps::Model::find_by_id(db, &appid).await?;
    if let None = app {
        return Err(anyhow!("没有对应的应用").into());
    }
    Model::insert_many(db, &data).await?;
    Ok(())
}

pub fn send_to_ws(svr: &Addr<WsActor>, data: &RecordPayload) -> ServiceResult<()> {
    let text = match data.to_string() {
        Ok(res) => res,
        Err(err) => {
            return Err(ServiceError::ToStrError {
                origin: data.clone(),
                result: err.to_string()
            });
        }
    };
    svr.do_send(LogMessage {
        app_id: data.get_appid(),
        text,
    });
    Ok(())
}

pub fn create_ws(
    appid: String,
    srv: web::Data<Addr<WsActor>>,
    req: &HttpRequest,
    stream: web::Payload,
) -> ServiceResult<HttpResponse> {
    match ws::start(
        WebsocketConnect::new(appid, srv.get_ref().clone()),
        req,
        stream,
    ) {
        Ok(res) => Ok(res),
        Err(err) => Err(anyhow!(err.to_string()).into())
    }
}

pub async fn get_error_list(db: &Database, appid: &str, data: &QueryPayload) -> ServiceResult<PaginationResult<Model>> {
    let res = Model::pagination(db, appid, data).await?;
    Ok(res)
}