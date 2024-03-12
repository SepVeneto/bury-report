use actix_web::{web, post};
use mongodb::Database;
use crate::services::{
    auth,
    Response
};
use crate::model::users::{LoginPayload, RegisterPayload};
use super::ApiResult;


pub fn init_service(config: &mut actix_web::web::ServiceConfig) {
  config.service(register);
  config.service(login);
}

#[post("/register")]
async fn register(db: web::Data<Database>, json: web::Json<RegisterPayload>) -> ApiResult {
    auth::register(&db, &json.0).await?;
    Response::ok("", None).to_json()
}

#[post("/login")]
async fn login(db: web::Data<Database>, json: web::Json<LoginPayload>) -> ApiResult {
    auth::login(&db, &json.0).await?;
    Response::ok("", None).to_json()
}
