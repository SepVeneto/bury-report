use actix_web::{HttpResponse, error};
use serde::Serialize;
use failure::Fail;

#[derive(Debug, Fail)]
pub enum BusinessError {
  #[fail(display = "validation error on field: {}", field)]
  ValidationError { field: String },
  #[fail(display = "An internal error orrcurred. Please try again later.")]
  InternalError,
}

impl error::ResponseError for BusinessError {
  fn error_response(&self) -> HttpResponse<actix_web::body::BoxBody> {
      match *self {
        BusinessError::ValidationError { .. } => {
          let response = Response::err(10001, &self.to_string());
          HttpResponse::BadRequest().json(response)
        }
        _ => {
          let response = Response::err(10000, &self.to_string());
          HttpResponse::InternalServerError().json(response)
        }
      }
  }
}

#[derive(Serialize)]
pub struct Response<T: Serialize> {
  code: i32,
  message: String,
  data: Option<T>,
}

impl <T: Serialize> Response<T> {
  pub fn ok(data: T) -> Self {
    Response { code: 0, message: "ok".to_owned(), data: Some(data) }
  }

  pub fn to_json (&self) -> Result<HttpResponse, BusinessError> {
    Ok(HttpResponse::Ok().json(self))
  }
}

impl Response<()> {
  pub fn err(error: i32, message: &str) -> Self {
    Response { code: error, message: message.to_owned(), data: None }
  }
}
