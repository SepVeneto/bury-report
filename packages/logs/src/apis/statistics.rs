use actix_web::{get, post, web, HttpResponse};
use log::info;
use mongodb::Database;
use serde_json::json;

use crate::{model::{self, statistics::Rule}, services::{statistics::{self, create}, Response, ServiceError}};

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
    info!("{:?}", payload);
    let appid = path.into_inner();
    let source= payload.get_source();
    let dimension = payload.get_dimension();
    let range = payload.get_range();
    let value = payload.get_value();
    let res = match payload.0 {
        Rule::Pie(_) => statistics::create(&db, &appid, &source, &dimension).await?,
        Rule::Line(_) => statistics::create_with_date(
            &db,
            &appid,
            &source,
            &dimension,
            &value,
            &range
        ).await?,
    };

    Response::ok(res, None).to_json()
}
