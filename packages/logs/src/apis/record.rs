use std::str::FromStr;

use actix_web::{get, post, web, HttpRequest};
use actix::Addr;
use mongodb::{Database, bson::{doc, DateTime, oid::ObjectId}};
use super::{ServiceResult, RecordPayload};
use crate::{config::{Response, BusinessError}, model};
use log::{error, info};
use crate::services::{actor::WsActor, ws::WebsocketConnect};

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
) -> ServiceResult {
    let app_id = path.into_inner();
    let oid = match ObjectId::from_str(&app_id) {
        Ok(oid) => oid,
        Err(err) => {
            error!("transfer object id failed: {}", err);
            return Err(BusinessError::InternalError);
        }
    };
    match db.collection::<model::App>("apps").find_one(doc! {"_id": oid }, None).await {
        Ok(res) => {
            if let None = res {
                error!("Couldn't find app {}", app_id);
                return Err(BusinessError::ValidationError { field: String::from("appid") });
            }
        },
        Err(err) => {
            error!("query failed: {}", err);
            return Err(BusinessError::InternalError);
        }
    }

    let resp = actix_web_actors::ws::start(
        WebsocketConnect::new(srv.get_ref().clone()),
        &req,
        stream
    );
    match resp {
        Ok(ret) => Ok(ret),
        Err(e) => {
            error!("Established websocket connection failed: {}", e);
            Err(BusinessError::InternalError)
        },
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

  let appid = match json.appid {
    Some(appid) => appid,
    _ => String::from("None"),
  };
  if appid == "None" {
    return Err(BusinessError::ValidationError { field: String::from("appid") });
  }

  let logs = db.collection::<model::Log>("logs");

  let record = model::Log {
    r#type: json.r#type,
    uuid: json.uuid,
    appid,
    data: json.data,
    create_time: DateTime::now(),
  };

  match record.to_string() {
    Ok(text) => {
        svr.do_send(crate::services::actor::LogMessage { text });
    },
    Err(_) => (),
  }

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
