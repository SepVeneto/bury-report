use actix_web::{delete, get, post, put, web, HttpRequest};
use anyhow::anyhow;
use mongodb::Client;
use super::ApiResult;
use log::{error, info};
use mongodb::Database;
use serde_json::Value;
use crate::db;
use crate::db::DbApp;
use crate::services::Response;
use crate::services::source;
use crate::model::{
    source::BasePayload,
    QueryPayload,
};
use crate::apis::get_appid;


pub fn init_service(config: &mut web::ServiceConfig) {
    config.service(get_options);
    config.service(get_list);
    config.service(get_source);
    config.service(set_source);
    config.service(update_source);
    config.service(delete_source);
}

#[get("/source/options")]
async fn get_options(
    req: HttpRequest,
    client: web::Data<Client>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let res = source::options(&db).await?;
    Response::ok(res, None).to_json()
}

#[get("/source")]
async fn get_list(
    req: HttpRequest,
    client: web::Data<Client>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    match source::list(&db).await {
        Ok(res) => Response::ok(res, None).to_json(),
        Err(err) => {
            Response::err(500, err.to_string()).to_json()
            // Ok(HttpResponse::InternalServerError().json(err.to_string()))
        }
    }
}

#[get("/source/{source_id}")]
async fn get_source(
    req: HttpRequest,
    path: web::Path<String>,
    client: web::Data<Client>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let source_id = path.into_inner();
    match source::detail(&db, &source_id).await? {
        Some(res) => Response::ok(res, None).to_json(),
        None => Err(anyhow!("找不到对应的数据源").into()),
    }
}

#[post("/source")]
async fn set_source(
    client: web::Data<Client>,
    json: web::Json<BasePayload>,
    req: HttpRequest,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = DbApp::get_by_appid(&client, &appid);
    let res = source::add(&db, json.0).await?;

    Response::ok(res, "添加成功").to_json()
}

#[put("/source/{source_id}")]
async fn update_source(
    req: HttpRequest,
    path: web::Path<String>,
    client: web::Data<Client>,
    json: web::Json<BasePayload>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let source_id = path.into_inner();
    info!("{:?}", json.0);
    let res = source::update(&db, &source_id, json.0).await?;
    Response::ok(res, "编辑成功").to_json()
}

#[delete("/source/{source_id}")]
async fn delete_source(
    req: HttpRequest,
    path: web::Path<String>,
    client: web::Data<Client>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let source_id = path.into_inner();
    source::delete(&db, &source_id).await?;
    Response::ok(Value::Null, Some("删除成功")).to_json()
}
