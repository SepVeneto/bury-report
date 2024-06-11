use actix_web::{get, web, post};
use mongodb::Database;
use crate::{model::config::Model, services::{config, Response}};
use super::ApiResult;


pub fn init_service(config: &mut web::ServiceConfig) {
    config.service(get_config);
    config.service(set_config);
}

#[get("/common/config")]
pub async fn get_config(db: web::Data<Database>) -> ApiResult{
    let res = config::get_config(&db).await?;
    Response::ok(res, None).to_json()
}

#[post("/common/config")]
pub async fn set_config(
    db: web::Data<Database>,
    data: web::Json<Model>,
) -> ApiResult {
    config::set_config(&db, data.0).await?;
    Response::ok("", "设置成功").to_json()
}
