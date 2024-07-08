use actix_web::{delete, get, post, put, web, HttpRequest};
use log::info;
use mongodb::{Client, Database};
use serde_json::json;
use crate::apis::{get_appid, ApiResult};

use crate::db::{self, DbApp};
use crate::services::apps;
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
    config.service(debug_aggrate);
    config.service(debug_gc_logs);
    config.service(aggregate_device_info);
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
    client: web::Data<Client>,
    payload: web::Json<Rule>,
) -> ApiResult {
    info!("{:?}", payload);
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let res = match payload.0 {
        Rule::Pie(_) => statistics::create_chart(&db, "Pie", payload.0).await?,
        Rule::Line(_) => statistics::create_chart(&db, "Line", payload.0).await?,
    };

    Response::ok(res, None).to_json()
}

#[put("/statistics/update/{statisticId}")]
pub async fn update_statistics(
    req: HttpRequest,
    client: web::Data<Client>,
    path: web::Path<String>,
    json: web::Json<Rule>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = DbApp::get_by_appid(&client, &appid);
    let statistic_id = path.into_inner();
    statistics::update(&db, &statistic_id, json.0).await?;
    Response::ok(json!({}), "修改成功").to_json()
}

#[get("/statistics/chart/{chart_id}")]
pub async fn get_statistic(
    req: HttpRequest,
    client: web::Data<Client>,
    path: web::Path<String>
) -> ApiResult {
    let chart_id = path.into_inner();
    let appid = get_appid(&req)?;
    let db = DbApp::get_by_appid(&client, &appid);
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
    client: web::Data<Client>
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = DbApp::get_by_appid(&client, &appid);
    let res = statistics::find_all(&db).await?;
    Response::ok(res, None).to_json()
}

#[get("/statistics/preview")]
pub async fn preview_statistics(
    req: HttpRequest,
    client: web::Data<Client>,
    payload: web::Query<Rule>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let source= payload.get_source();
    let dimension = payload.get_dimension();
    let range = payload.get_range();
    let value = payload.get_value();
    let sort = payload.get_sort();
    let res = match payload.0 {
        Rule::Pie(_) => statistics::query_pie(
            &db,
            &source,
            &dimension,
            &sort,
        ).await?,
        Rule::Line(_) => statistics::query_with_date(
            &db,
            &source,
            &dimension,
            &value,
            &range
        ).await?,
    };

    Response::ok(res, None).to_json()
}

#[get("/statistics/gc_log/{appid}")]
pub async fn debug_aggrate(
    client: web::Data<Client>,
    path: web::Path<String>
) -> ApiResult {
    let appid = path.into_inner();
    apps::gc_log(&client, &appid, 7).await?;

    Response::ok("", None).to_json()
}

#[get("/statistics/gc_logs")]
pub async fn debug_gc_logs(
    client: web::Data<Client>,
) -> ApiResult {
    apps::gc_logs(&client, 7).await?;

    Response::ok("", None).to_json()
}

#[get("/statistics/collect_info")]
pub async fn aggregate_device_info(
    client: web::Data<Client>,
    req: HttpRequest
) -> ApiResult {
    const LIMIT: u32 = 0;

    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);

    statistics::aggregate_devices(&db, LIMIT).await?;
    apps::clear_info(&db, LIMIT).await?;

    Response::ok("设备数据整理完成", None).to_json()
}
