use actix::Addr;
use actix_web::{web, HttpRequest, HttpResponse};
use actix_web_actors::ws;
use mongodb::Database;

use crate::model::{
    apps,
    logs::{RecordPayload, Model},
};

use super::{actor::{LogMessage, WsActor}, ws::WebsocketConnect, ServiceError, ServiceResult};

pub async fn record(db: &Database, data: &RecordPayload) -> ServiceResult<()> {
    let appid = data.get_appid();
    let app = apps::Model::find_by_id(db, &appid).await?;
    if let None = app {
        return Err(ServiceError::LogicError("没有对应的应用".to_owned()));
    }
    Model::insert_many(db, &data).await?;
    Ok(())
}

pub fn send_to_ws(svr: &Addr<WsActor>, data: &RecordPayload) -> ServiceResult<()> {
    let text = match data.to_string() {
        Ok(res) => res,
        Err(err) => {
            return Err(ServiceError::JsonError(err.to_string()));
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
        Err(err) => Err(ServiceError::InternalError(err.to_string()))
    }
}