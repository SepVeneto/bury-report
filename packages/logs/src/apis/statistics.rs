use actix_web::{delete, get, post, put, web, HttpRequest};
use log::info;
use mongodb::Database;
use serde_json::json;
use crate::apis::{get_appid, ApiResult};

use crate::{
    model::statistics::Rule,
    services::{
        statistics,
        Response,
    }
};

pub fn init_service(config: &mut web::ServiceConfig) {
    config.service(get_statistic);
    config.service(get_list);
    config.service(create_statistics);
    config.service(preview_statistics);
    config.service(update_statistics);
    config.service(del_statistic);
}

// #[get("/{appid}/statistic/total")]
// pub async fn get_statistcs(
//     db: web::Data<Database>,
//     path: web::Path<String>
// ) -> Result<HttpResponse, ServiceError> {
//     let appid = path.into_inner();
//     const LOG_TYPE: &str = "__BR_COLLECT_INFO__";
//     let res_total = statistics::count_total(&db, &appid, LOG_TYPE, false).await?;
//     let res_yesterday = statistics::count_yesterday(&db, &appid, LOG_TYPE, false).await?;
//     let res_total_unique = statistics::count_total(&db, &appid, LOG_TYPE, true).await?;
//     let res_yesterday_unique = statistics::count_yesterday(&db, &appid, LOG_TYPE, true).await?;

//     let res = json!({
//         "total": res_total,
//         "total_unique": res_total_unique,
//         "yesterday": res_yesterday,
//         "yesterday_unique": res_yesterday_unique,
//     });
//     Response::ok(res, None).to_json()
// }

#[post("/statistics/create")]
pub async fn create_statistics(
    req: HttpRequest,
    db: web::Data<Database>,
    payload: web::Json<Rule>,
) -> ApiResult {
    info!("{:?}", payload);
    let appid = get_appid(&req)?;
    let res = match payload.0 {
        Rule::Pie(_) => statistics::create_chart(&db, "Pie", &appid, payload.0).await?,
        Rule::Line(_) => statistics::create_chart(&db, "Line", &appid, payload.0).await?,
    };

    Response::ok(res, None).to_json()
}

#[put("/statistics/update/{statisticId}")]
pub async fn update_statistics(
    db: web::Data<Database>,
    path: web::Path<String>,
    json: web::Json<Rule>,
) -> ApiResult {
    let statistic_id = path.into_inner();
    statistics::update(&db, &statistic_id, json.0).await?;
    Response::ok(json!({}), "修改成功").to_json()
}

#[get("/statistics/chart/{chart_id}")]
pub async fn get_statistic(
    db: web::Data<Database>,
    path: web::Path<String>
) -> ApiResult {
    let chart_id = path.into_inner();
    let res = statistics::find_cache(&db, &chart_id).await?;
    Response::ok(res, None).to_json()
}
#[delete("/statistics/{statistic_id}")]
pub async fn del_statistic(
    db: web::Data<Database>,
    path: web::Path<String>
) -> ApiResult {
    let statistic_id = path.into_inner();
    statistics::delete(&db, &statistic_id).await?;
    Response::ok(json!({}), "删除成功").to_json()
}

#[get("/statistics/list")]
pub async fn get_list(
    req: HttpRequest,
    db: web::Data<Database>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let res = statistics::find_all(&db, &appid).await?;
    Response::ok(res, None).to_json()
}

#[get("/statistics/preview")]
pub async fn preview_statistics(
    req: HttpRequest,
    db: web::Data<Database>,
    payload: web::Query<Rule>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let source= payload.get_source();
    let dimension = payload.get_dimension();
    let range = payload.get_range();
    let value = payload.get_value();
    let sort = payload.get_sort();
    let res = match payload.0 {
        Rule::Pie(_) => statistics::query_pie(
            &db,
            &appid,
            &source,
            &dimension,
            &sort,
        ).await?,
        Rule::Line(_) => statistics::query_with_date(
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
