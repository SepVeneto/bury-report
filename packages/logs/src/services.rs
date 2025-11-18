use actix_web::HttpResponse;
use bson::{doc, Document};
use chrono::{FixedOffset, LocalResult, NaiveDateTime, TimeZone};
use log::error;
use serde::Serialize;
use thiserror::Error;

use crate::apis::ApiError;
use crate::model::logs::RecordPayload;
use crate::model::ModelError;
use anyhow::{anyhow, Result};

pub mod ws;
pub mod actor;
pub mod record_logs;
pub mod device;

#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("序列化失败")]
    SerializeError(#[from] serde_json::Error),
    #[error("生成oid失败")]
    OidGenError(#[from] bson::oid::Error),
    #[error(transparent)]
    InternalError(#[from] ModelError),
    #[error("transform to string error {result:?} with {origin:?}")]
    ToStrError {
        origin: RecordPayload,
        result: String,
    },
    #[error(transparent)]
    DbError(#[from] mongodb::error::Error),
    #[error(transparent)]
    Common(#[from] anyhow::Error),
}

pub type ServiceResult<T> = Result<T, ServiceError>;

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

  pub fn to_json (&self) -> Result<HttpResponse, ApiError> {
    Ok(HttpResponse::Ok().json(self))
  }
}

impl Response<()> {
  pub fn err(error: i32, message: String) -> Self {
    Response { code: error, message: message.to_owned(), data: None }
  }
}

pub fn normalize_time(time_str: String) -> Result<bson::DateTime> {
    match NaiveDateTime::parse_from_str(&time_str, "%Y-%m-%d %H:%M:%S") {
        Ok(naive_datetime) => {
            if let Some(fixed_offset) = FixedOffset::east_opt(8 * 3600) {
                match fixed_offset.from_local_datetime(&naive_datetime) {
                    LocalResult::Single(res) => {
                        Ok(bson::DateTime::from_chrono(res))
                    },
                    _ => {
                        error!("convert failed with time: {}", time_str);
                        Err(anyhow!("时间转换失败"))
                    }
                }
            } else {
                error!("generate timezone failed with time: {}", time_str);
                Err(anyhow!("时区生成失败"))
            }
        },
        Err(err) => {
            error!("parse to naive date time failed: {:?}", err);
            Err(anyhow!("时间格式非法"))
        }
    }
}

pub fn gen_timerange_doc(start_time: String, end_time: String) -> Result<Document> {
    let start_time = normalize_time(start_time)?;
    let end_time = normalize_time(end_time)?;

    Ok(doc! {
        "$gte": start_time,
        "$lte": end_time
    })
}
