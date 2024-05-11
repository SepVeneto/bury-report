pub mod auth;
pub mod record;
pub mod source;
pub mod statistics;

use actix_web::{HttpResponse, HttpRequest};
use crate::services::ServiceError;

pub type ApiResult = Result<HttpResponse, ServiceError>;

pub fn get_appid(req: &HttpRequest) -> Result<String, ServiceError> {
    let appid = req.headers().get("appid").ok_or("缺少appid")?;

    let appid = appid.to_str()?;
    Ok(appid.to_string())
}
