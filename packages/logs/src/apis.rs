pub mod auth;
pub mod record;

use actix_web::HttpResponse;
use crate::config::BusinessError;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};


pub type ServiceResult = Result<HttpResponse, BusinessError>;

#[derive(Deserialize, Serialize)]
pub struct RegisterPayload {
  name: String,
  password: String,
}

#[derive(Deserialize, Serialize)]
pub struct LoginPayload {
  name: String,
  password: String,
  key: String,
  offset: usize,
}

#[derive(Deserialize, Serialize)]
pub struct SystemInfo {
    uuid: String,
}
#[derive(Deserialize, Serialize, Clone)]
#[serde(untagged)]
pub enum RecordPayload {
    V1(RecordV1),
    V2(RecordV2),
}

#[derive(Deserialize, Serialize, Clone)]
pub struct RecordV1 {
  pub r#type: String,
  pub appid: String,
  pub data: Map<String, Value>,
  pub uuid: String,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct RecordV2 {
  pub appid: String,
  pub data: Vec<RecordV1>,
}
