pub mod record;
pub mod notify;

use actix_web::{HttpRequest, HttpResponse, http::header::ToStrError};
use thiserror::Error;
use anyhow::Result;

use crate::services::{Response, ServiceError};

#[derive(Error, Debug)]
pub enum ApiError {
    #[error(transparent)]
    InternalError {
        #[from]
        source: ServiceError,
    },
    #[error("校验错误: {err}, in {file}:{line}:{col}")]
    ValidateError { err: String, col: u32, line: u32, file: String  },
    #[error("Appid错误")]
    AppidError(#[from] AppidError),
    #[error(transparent)]
    CommonError(#[from] anyhow::Error),
    #[error("FOO!")]
    InvalidError(),
}
impl From<std::io::Error> for ApiError {
    fn from(err: std::io::Error) -> Self {
        ApiError::ValidateError {
            err: err.to_string(),
            col: column!(),
            line: line!(),
            file: file!().to_string()
        }
    }
}
impl From<serde_json::Error> for ApiError {
    fn from(err: serde_json::Error) -> Self {
        ApiError::ValidateError {
            err: err.to_string(),
            col: column!(),
            line: line!(),
            file: file!().to_string()
        }
    }
}
impl actix_web::error::ResponseError for ApiError {
    fn error_response(&self) -> HttpResponse {
        match self {
            ApiError::InvalidError {} => {
                HttpResponse::BadRequest().into()
            },
            _ => Response::err(500, self.to_string()).to_json().unwrap()
        }
    }
}

pub type ApiResult = Result<HttpResponse, ApiError>;

#[derive(Error, Debug)]
pub enum AppidError {
    #[error("cannot find appid")]
    GetError,
    #[error("get appid failed")]
    ToStrError(#[from] ToStrError)
}

pub fn get_appid(req: &HttpRequest) -> anyhow::Result<String, AppidError> {
    if let Some(appid) = req.headers().get("appid") {
        let appid = appid.to_str()?;
        Ok(appid.to_string())
    } else {
        Err(AppidError::GetError)
    }
}
