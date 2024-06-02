use actix_web::{delete, get, post, web, HttpRequest};
use mongodb::Database;
use serde::{Deserialize, Serialize};

use crate::{model::QueryPayload, services::{apps, Response}};

use super::ApiResult;

pub fn init_service(config: &mut web::ServiceConfig) {
    config.service(get_app_list);
    config.service(create_app);
    config.service(delete_app);
}

#[get("/app/list")]
pub async fn get_app_list(
    db: web::Data<Database>,
    query: web::Query<QueryPayload>,
) -> ApiResult {
    let res = apps::get_list(&db, &query).await?;
    Response::ok(res, None).to_json()
}

#[derive(Deserialize, Serialize)]
pub struct CreatePayload {
    pub name: String,
}
#[post("/app")]
pub async fn create_app(
    db: web::Data<Database>,
    json: web::Json<CreatePayload>
) -> ApiResult {
    let res = apps::create_app(&db, &json).await?;
    Response::ok(res, "创建成功").to_json()
}

#[delete("/app/{appid}")]
pub async fn delete_app(
    db: web::Data<Database>,
    path: web::Path<String>,
) -> ApiResult {
    let appid = path.into_inner();
    apps::delete_app(&db, &appid).await?;
    Response::ok("", "删除成功").to_json()
}
