use actix_web::{delete, get, post, put, web, HttpRequest};
use anyhow::anyhow;
use super::ApiResult;
use log::{error, info};
use mongodb::Database;
use serde_json::Value;
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
    db: web::Data<Database>,
) -> ApiResult {
    match req.headers().get("appid") {
        Some(appid) => {
            let res = source::options(&db, &appid.to_str().unwrap()).await.unwrap();
            Response::ok(res, None).to_json()
        },
        None => {
            Response::err(500, "缺少appid".to_string()).to_json()
        }
    }
}

#[get("/source")]
async fn get_list(
    req: HttpRequest,
    db: web::Data<Database>,
    mut query: web::Query<QueryPayload>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    query.set_appid(&appid);
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
) -> ApiResult {
    let source_id = path.into_inner();
    match source::detail(&db, &source_id).await? {
        Some(res) => Response::ok(res, None).to_json(),
        None => Err(anyhow!("找不到对应的数据源").into()),
    }
}

#[post("/source")]
async fn set_source(
    db: web::Data<Database>,
    mut json: web::Json<BasePayload>,
    req: HttpRequest,
) -> ApiResult {
    let appid = get_appid(&req)?;
    json.set_appid(&appid);
    match source::add(&db, json.0).await {
        Ok(res) => Response::ok(res, "添加成功").to_json(),
        Err(err) => {
            error!("{:?}", err);
            Response::err(500, err.to_string()).to_json()
        }
    }
}

#[put("/source/{source_id}")]
async fn update_source(
    path: web::Path<String>,
    db: web::Data<Database>,
    json: web::Json<BasePayload>,
) -> ApiResult {
    let source_id = path.into_inner();
    info!("{:?}", json.0);
    let res = source::update(&db, &source_id, json.0).await?;
    Response::ok(res, "编辑成功").to_json()
}

#[delete("/source/{source_id}")]
async fn delete_source(
    path: web::Path<String>,
    db: web::Data<Database>,
) -> ApiResult {
    let source_id = path.into_inner();
    source::delete(&db, &source_id).await?;
    Response::ok(Value::Null, Some("删除成功")).to_json()
}
