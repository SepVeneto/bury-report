use actix_web::{get, post, web, HttpRequest, HttpResponse};
use actix::Addr;
use mongodb::{Database, bson::{doc, DateTime}};
use super::{ServiceResult, RecordPayload};
use crate::{config::{Response, BusinessError}, model};
use log::{error, info};
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
    json_body: web::Payload,
) -> ServiceResult {
  // default size limit 256KB
  let json = payload_handler(json_body).await?;

  if let None = json.appid.to_owned() {
    return Err(BusinessError::ValidationError { field: String::from("appid") });
    // return Response::err(10001, "缺少appid").to_json();
  }

  let logs = db.collection::<model::Log>("logs");

  let appid = json.appid.to_owned().unwrap();
  let record = model::Log {
    r#type: json.r#type.to_owned(),
    appid,
    data: json.data,
    create_time: DateTime::now(),
  };

  let msg = format!("{}", &record.r#type);
  // broadcast to manage clients
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

async fn payload_handler(payload: web::Payload) -> Result<RecordPayload, BusinessError> {
    let res = match payload.to_bytes().await {
        Ok(res) => res,
        Err(_) => { return Err(BusinessError::InternalError); }
    };
    let json = serde_json::from_slice::<RecordPayload>(&res);

    match json {
        Ok(json) => Ok(json),
        Err(err) => {
            error!("Invalid JSON: {:?}", err);
            Err(BusinessError::InternalError)
        }
    }
}
