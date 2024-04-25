use core::fmt;

use crate::model::QueryError;
use actix_web::{HttpResponse, error};
use mongodb::bson::oid;
use serde::Serialize;
use std::error::Error;
use failure::{self, Fail, Context};
use failure::format_err;

pub mod ws;
pub mod actor;
pub mod source;
pub mod auth;
pub mod record_logs;
pub mod statistics;

pub type ServiceResult<T> = Result<T, ServiceError>;

pub type ServiceError = Box<dyn Error>;

//     fn from(error: Context<String>) -> Self {
//         Box::new(format!("test"))
//     }
// }

// #[derive(Debug)]
// pub enum ServiceError {
//     LogicError(String),
//     InternalError(String),
//     JsonError(String),
// }

// impl fmt::Display for ServiceError {
//     fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
//         let msg = match self {
//             ServiceError::InternalError(err) => err.to_owned(),
//             ServiceError::LogicError(err) => err.to_owned(),
//             ServiceError::JsonError(err) => err.to_string(),
//         };
//         f.write_str(&msg)
//     }
// }

// impl From<QueryError> for ServiceError {
//     fn from(err: QueryError) -> Self {
//         ServiceError::InternalError(err.to_string())
//     }
// }
// impl From<oid::Error> for ServiceError {
//     fn from(err: oid::Error) -> Self {
//         ServiceError::InternalError(err.to_string())
//     }
// }

// impl error::ResponseError for ServiceError {
//     fn error_response(&self) -> HttpResponse<actix_web::body::BoxBody> {
//         let response = Response::err(10000, &self.to_string());
//         HttpResponse::InternalServerError().json(response)
//     }
// }

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

  pub fn to_json (&self) -> Result<HttpResponse, ServiceError> {
    Ok(HttpResponse::Ok().json(self))
  }
}

impl Response<()> {
  pub fn err(error: i32, message: String) -> Self {
    Response { code: error, message: message.to_owned(), data: None }
  }
}


