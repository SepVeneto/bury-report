use actix_web::{get, post, web, HttpResponse};
use mongodb::Database;
use serde_json::json;

use crate::{model, services::{statistics::{self, create}, Response, ServiceError}};

pub fn init_service(config: &mut web::ServiceConfig) {
    config.service(get_statistcs);
    config.service(create_statistics);
}

#[get("/{appid}/statistic/total")]
pub async fn get_statistcs(
    db: web::Data<Database>,
    path: web::Path<String>
) -> Result<HttpResponse, ServiceError> {
    let appid = path.into_inner();
    const LOG_TYPE: &str = "__BR_COLLECT_INFO__";
    let res_total = statistics::count_total(&db, &appid, LOG_TYPE, false).await?;
    let res_yesterday = statistics::count_yesterday(&db, &appid, LOG_TYPE, false).await?;
    let res_total_unique = statistics::count_total(&db, &appid, LOG_TYPE, true).await?;
    let res_yesterday_unique = statistics::count_yesterday(&db, &appid, LOG_TYPE, true).await?;

    let res = json!({
        "total": res_total,
        "total_unique": res_total_unique,
        "yesterday": res_yesterday,
        "yesterday_unique": res_yesterday_unique,
    });
    Response::ok(res, None).to_json()
}

#[post("/{appid}/statistic/create")]
pub async fn create_statistics(
    db: web::Data<Database>,
    path: web::Path<String>,
    payload: web::Json<model::statistics::Rule>,
) -> Result<HttpResponse, ServiceError> {
    let appid = path.into_inner();
    let source= payload.get_source();
    let dimension = payload.get_dimension();
    let res = statistics::create(&db, &appid, &source, &dimension).await?;

    Response::ok(res, None).to_json()
}
