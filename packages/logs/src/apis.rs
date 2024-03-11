pub mod auth;
pub mod record;
pub mod source;

use actix_web::HttpResponse;
use crate::services::ServiceError;

pub type ApiResult = Result<HttpResponse, ServiceError>;
