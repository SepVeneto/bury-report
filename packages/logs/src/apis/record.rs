use std::str::FromStr;

use actix_web::{get, post, web, HttpRequest};
use actix::Addr;
use mongodb::{bson::{doc, oid::ObjectId, DateTime}, error::Error, results::InsertManyResult, Database};
use super::{RecordPayload, ServiceResult};
use crate::model::*;
use crate::config::{Response, BusinessError};
use log::{error, info};
use crate::services::{actor::WsActor, ws::WebsocketConnect};

pub fn init_service(config: &mut web::ServiceConfig) {
  config.service(record_log);
  config.service(record_ws);
}

async fn is_app_exist(
    db: &web::Data<Database>,
    app_id: &str,
) -> Result<bool, BusinessError> {
    let oid = match ObjectId::from_str(app_id) {
        Ok(oid) => oid,
        Err(err) => {
            error!("transfer object id failed: {}", err);
            return Err(BusinessError::ValidationError { field: String::from("appid") });
        }
    };
    match apps::Model::collection(&db)
    .find_one(doc! {"_id": oid }, None)
    .await {
        Ok(res) => {
            if let None = res {
                error!("Couldn't find app {}", app_id);
                return Err(BusinessError::ValidationError { field: String::from("appid") });
            } else {
                return Ok(true);
            }
        },
        Err(err) => {
            error!("query failed: {}", err);
            return Err(BusinessError::InternalError);
        }
    }
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
    if let Err(err) = is_app_exist(&db, &app_id).await {
        return Err(err);
    }

    let resp = actix_web_actors::ws::start(
        WebsocketConnect::new(app_id, srv.get_ref().clone()),
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
    let record = Record::new(json, db);

    if !record.is_app_exist().await {
        return Err(BusinessError::ValidationError { field: "appid".to_string() })
    }

    {
        let records = record.normalize();
        records.into_iter().for_each(|item| {
            match item.to_string() {
                Ok(text) => {
                    svr.do_send(crate::services::actor::LogMessage {
                        app_id: record.get_appid().to_string(),
                        text,
                    });
                },
                Err(_) => (),
            }
        })
    }

  let result = record.insert_record().await;
  match result {
    Ok(result) => {
    info!("record log {:?}", result.inserted_ids);
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
        Err(err) => { 
            error!("json valid, error: {}", err);
            return Err(BusinessError::InternalError);
        }
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


struct Record {
    data: RecordPayload,
    db: web::Data<Database>,
}
impl Record {
    fn new(data: RecordPayload, db: web::Data<Database>) -> Self {
        Self {
            data,
            db,
        }
    }

    async fn is_app_exist(&self) -> bool {
        let app_id = match &self.data {
            RecordPayload::V1(v1) => &v1.appid,
            RecordPayload::V2(v2) => &v2.appid,
        };
        let oid = match ObjectId::from_str(app_id) {
            Ok(oid) => oid,
            Err(err) => {
                error!("transfer object id failed: {}", err);
                return false;
            }
        };
        match apps::Model::collection(&self.db)
            .find_one(doc! {"_id": oid}, None)
            .await {
                Ok(res) => {
                    if let None = res {
                        error!("Couldn't find app {}", app_id);
                        return false;
                    }
                },
                Err(err) => {
                    error!("query failed: {}", err);
                    return false;
                }
            };
        true
    }

    fn get_appid(&self) -> &str {
        match &self.data {
            RecordPayload::V1(v1) => &v1.appid,
            RecordPayload::V2(v2) => &v2.appid,
        }
    }

    async fn insert_record(&self) -> Result<InsertManyResult, Error> {
        let logs = logs::Log::collection(&self.db);
        logs.insert_many(self.normalize(), None).await
    }

    fn normalize(&self) -> Vec<logs::Log> {
        match &self.data {
            RecordPayload::V1(v1) => {
                let record = self.normalize_from(v1);
                vec![record]
            }
            RecordPayload::V2(v2) => {
                let records = v2.data.clone().into_iter()
                    .map(|record| self.normalize_from(&record));
                records.collect()
            }
        }

    }
    fn normalize_from(&self, record: &super::RecordV1) -> logs::Log {
        let record = record.clone();
        logs::Log {
            r#type: record.r#type,
            uuid: record.uuid,
            appid: record.appid,
            data: record.data,
            create_time: DateTime::now(),
        }
    }
}
