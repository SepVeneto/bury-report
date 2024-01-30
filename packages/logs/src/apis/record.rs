use actix_web::{get, post, web, HttpRequest, HttpResponse};
use actix::Addr;
use mongodb::{Database, bson::{doc, DateTime}};
use super::{ServiceResult, RecordPayload};
use crate::{config::{Response, BusinessError}, model};
use log::info;
use crate::services::{actor::WsActor, ws::WebsocketConnect};

pub fn init_service(config: &mut web::ServiceConfig) {
  config.service(record_log);
  config.service(record_ws);
}

#[get("/record/ws")]
async fn record_ws(
    db: web::Data<Database>,
    req: HttpRequest,
    stream: web::Payload,
    srv: web::Data<Addr<WsActor>>,
) -> HttpResponse {
    // let conn = WsConn;
    db.list_collection_names(doc! {}).await.unwrap();
    let resp = actix_web_actors::ws::start(
        WebsocketConnect::new(srv.get_ref().clone()),
        &req,
        stream
    );
    match resp {
        Ok(ret) => ret,
        Err(e) => e.error_response(),
    }
}

#[post("/record")]
async fn record_log(
    db: web::Data<Database>,
    svr: web::Data<Addr<WsActor>>,
    json: web::Json<RecordPayload>
) -> ServiceResult {
  if let None = json.appid.to_owned() {
    return Response::err(10001, "缺少appid").to_json();
  }

  let logs = db.collection::<model::Log>("logs");

  let appid = json.appid.to_owned().unwrap();
  let record = model::Log {
    r#type: json.r#type.to_owned(),
    appid,
    createTime: DateTime::now(),
  };

  let msg = format!("{}", &record.r#type);
//   svr.send(msg);
  let _ = svr.do_send(crate::services::actor::LogMessage { text: msg });

  let result = logs.insert_one(record, None).await;
  match result {
    Ok(result) => {
    info!("record log {}", result.inserted_id);
      Response::ok("").to_json()
    },
    Err(err) => {
      log::error!("err: {}", err.to_string());
      Err(BusinessError::InternalError)
    }
  }
}
