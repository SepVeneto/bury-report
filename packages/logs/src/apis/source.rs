use actix_web::{delete, get, patch, post, put, web, HttpResponse};
use mongodb::Database;
use serde_json::Value;
use crate::services::{ServiceError, Response};
use crate::services::source;
use crate::model::source::{BasePayload, QueryPayload};


pub fn init_service(config: &mut web::ServiceConfig) {
    config.service(get_list);
    config.service(get_source);
    config.service(set_source);
    config.service(update_source);
    config.service(modify_source);
    config.service(delete_source);
}

#[get("/source")]
async fn get_list(
    db: web::Data<Database>,
    query: web::Query<QueryPayload>,
) -> Result<HttpResponse, ServiceError> {
    match source::list(&db, query.0).await {
        Ok(res) => Response::ok(res, None).to_json(),
        Err(err) => {
            Response::err(500, err.to_string()).to_json()
            // Ok(HttpResponse::InternalServerError().json(err.to_string()))
        }
    }
}

#[get("/source/{source_id}")]
async fn get_source(
    path: web::Path<String>,
    db: web::Data<Database>,
) -> Result<HttpResponse, ServiceError> {
    let source_id = path.into_inner();
    match source::detail(&db, &source_id).await? {
        Some(res) => Response::ok(res, None).to_json(),
        None => Err("找不到对应的数据源".into()),
    }
}

#[post("/source")]
async fn set_source(
    db: web::Data<Database>,
    json: web::Json<BasePayload>,
) -> Result<HttpResponse, ServiceError> {
    let res = source::add(&db, json.0).await?;
    Response::ok(res, "添加成功").to_json()
}

#[post("/source/{source_id}")]
async fn modify_source(
    path: web::Path<String>,
    db: web::Data<Database>,
    json: web::Json<BasePayload>,
) -> Result<HttpResponse, ServiceError> {
    let source_id = path.into_inner();
    source::update(&db, &source_id, json.0).await?;
    Response::ok(Value::Null, "编辑成功").to_json()
}

#[put("/source/{source_id}")]
async fn update_source(
    path: web::Path<String>,
    db: web::Data<Database>,
    json: web::Json<BasePayload>,
) -> Result<HttpResponse, ServiceError> {
    let source_id = path.into_inner();
    let res = source::update(&db, &source_id, json.0).await?;
    Response::ok(res, "编辑成功").to_json()
}

#[delete("/source/{source_id}")]
async fn delete_source(
    path: web::Path<String>,
    db: web::Data<Database>,
) -> Result<HttpResponse, ServiceError> {
    let source_id = path.into_inner();
    source::delete(&db, &source_id).await?;
    Response::ok(Value::Null, Some("删除成功")).to_json()
}
