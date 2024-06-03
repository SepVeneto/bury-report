pub mod auth;
pub mod record;
pub mod source;
pub mod statistics;
pub mod apps;

use actix_web::{http::header::ToStrError, HttpRequest, HttpResponse};
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
    #[error("请求错误")]
    AppidError(#[from] AppidError),
    #[error(transparent)]
    CommonError(#[from] anyhow::Error),
}
impl actix_web::error::ResponseError for ApiError {
    fn error_response(&self) -> HttpResponse {
        Response::err(500, self.to_string()).to_json().unwrap()
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
