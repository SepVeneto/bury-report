use actix_web::HttpResponse;
use bson::doc;
use log::error;
use serde::Serialize;
use thiserror::Error;

use crate::apis::ApiError;
use crate::model::ModelError;
use anyhow::Result;

pub mod record_logs;
pub mod task;

#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("序列化失败")]
    SerializeError(#[from] serde_json::Error),
    #[error("生成oid失败")]
    OidGenError(#[from] bson::oid::Error),
    #[error(transparent)]
    InternalError(#[from] ModelError),
    #[error(transparent)]
    DbError(#[from] mongodb::error::Error),
    #[error(transparent)]
    Common(#[from] anyhow::Error),
}

pub type ServiceResult<T> = Result<T, ServiceError>;

#[derive(Serialize)]
pub struct Response<T: Serialize> {
  code: i32,
  message: String,
  data: Option<T>,
}

impl <T: Serialize> Response<T> {
  pub fn ok<'a>(data: T, msg: impl Into<Option<&'a str>>) -> Self {
    let message = msg.into().unwrap_or("ok").to_string();
    Response { code: 0, message, data: Some(data) }
  }

  pub fn to_json (&self) -> Result<HttpResponse, ApiError> {
    Ok(HttpResponse::Ok().json(self))
  }
}

impl Response<()> {
  pub fn err(error: i32, message: String) -> Self {
    Response { code: error, message: message.to_owned(), data: None }
  }
}
