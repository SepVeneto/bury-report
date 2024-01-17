pub mod auth;
pub mod record;

use actix_web::HttpResponse;
use crate::config::BusinessError;

use serde::{Deserialize, Serialize};


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
pub struct RecordPayload {
  pub r#type: String,
  pub appid: Option<String>,
}
