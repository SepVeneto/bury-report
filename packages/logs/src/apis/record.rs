use actix_web::{post, web};
use mongodb::{Database, bson::DateTime};
use super::{ServiceResult, RecordPayload};
use crate::{model, config::{Response, BusinessError}};
use log::info;

pub fn init_service(config: &mut web::ServiceConfig) {
  config.service(record_log);
}


#[post("/record")]
async fn record_log(db: web::Data<Database>, json: web::Json<RecordPayload>) -> ServiceResult {
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
