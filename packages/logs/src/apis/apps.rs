use std::time::SystemTime;

use actix_web::{put, delete, get, post, web, HttpRequest};
use bson::doc;
use log::debug;
use mongodb::{Client, Database};
use serde::{Deserialize, Serialize};
use tokio_cron_scheduler::JobScheduler;

use crate::{db, model::QueryPayload, services::{self, apps, task::TaskPayload, trigger::TriggerFilter, Response}};

use super::{get_appid, ApiResult, Query};


pub fn init_service(config: &mut web::ServiceConfig) {
    config.service(get_app_list);
    config.service(create_app);
    config.service(delete_app);

    config.service(create_trigger);
    config.service(edit_trigger);
    config.service(delete_trigger);
    config.service(get_trigger_list);
    config.service(get_trigger_options);

    config.service(create_task);
    config.service(update_task);
    config.service(stop_task);
    config.service(trigger_task);
    config.service(get_task_list);
    config.service(get_task_logs);
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
    pub color: Option<String>,
}
#[post("/{project}/app")]
pub async fn create_app(
    db: web::Data<Database>,
    client: web::Data<Client>,
    json: web::Json<CreatePayload>,
    // project_id: web::Path<String>,
) -> ApiResult {
    // let project_id = project_id.into_inner();
    let res = apps::create_app(&client, &db, &json).await?;
    Response::ok(res, "创建成功").to_json()
}

#[delete("/app/{appid}")]
pub async fn delete_app(
    client: web::Data<Client>,
    db: web::Data<Database>,
    path: web::Path<String>,
) -> ApiResult {
    let appid = path.into_inner();
    apps::delete_app(&client, &db, &appid).await?;
    Response::ok("", "删除成功").to_json()
}

#[derive(Deserialize, Serialize)]
pub struct TaskTrigger {
    pub name: String,
    pub webhook: String,
}
#[post("/trigger")]
pub async fn create_trigger(
    req: HttpRequest,
    json: web::Json<TaskTrigger>,
    client: web::Data<Client>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);

    let res = services::trigger::create(&db, json.0).await?;
    Response::ok(res, "创建成功").to_json()
}

#[put("/trigger/{trigger_id}")]
pub async fn edit_trigger(
    req: HttpRequest,
    path: web::Path<String>,
    json: web::Json<TaskTrigger>,
    client: web::Data<Client>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let id = path.into_inner();

    let res = services::trigger::update(&db, &id, json.0).await?;
    Response::ok(res, "修改成功").to_json()
}

#[get("/trigger/list")]
pub async fn get_trigger_list(
    req: HttpRequest,
    query: web::Query<Query<TriggerFilter>>,
    client: web::Data<Client>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);

    let res = services::trigger::list(&db, query.0).await?;

    Response::ok(res, None).to_json()
}

#[delete("/trigger/{id}")]
pub async fn delete_trigger(
    req: HttpRequest,
    client: web::Data<Client>,
    path: web::Path<String>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let id = path.into_inner();

    let res = services::trigger::delete(&db, &id).await?;
    Response::ok(res, "删除成功").to_json()
}

#[get("/trigger/options")]
pub async fn get_trigger_options(
    req: HttpRequest,
    client: web::Data<Client>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);

    let res = services::trigger::options(&db).await?;
    Response::ok(res, None).to_json()
}

#[post("/task")]
pub async fn create_task(
    req: HttpRequest,
    client: web::Data<Client>,
    data: web::Json<TaskPayload>
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);

    let res = services::task::create(&db, data.0).await?;

    Response::ok(res, "创建成功").to_json()
}

#[put("/task/{id}")]
pub async fn update_task(
    req: HttpRequest,
    client: web::Data<Client>,
    data: web::Json<TaskPayload>,
    schelder: web::Data<JobScheduler>,
    path: web::Path<String>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let task_id = path.into_inner();

    let _ = services::task::update(&db, &task_id, &schelder, data.0).await?;

    Response::ok((), "修改成功").to_json()
}
#[post("/task/{id}/stop")]
pub async fn stop_task(
    req: HttpRequest,
    client: web::Data<Client>,
    scheduler: web::Data<JobScheduler>,
    path: web::Path<String>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let task_id = path.into_inner();

    services::task::stop(&db, &scheduler, &task_id).await?;
    Response::ok((), "任务已停止").to_json()
}
#[post("/task/{id}/trigger")]
pub async fn trigger_task(
    req: HttpRequest,
    client: web::Data<Client>,
    path: web::Path<String>,
    scheduler: web::Data<JobScheduler>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let task_id = path.into_inner();

    // TODO: 优化两次查询

    let mut start_count = SystemTime::now();
    services::task::stop(&db, &scheduler, &task_id).await?;
    debug!("stop task: {:?}", SystemTime::now().duration_since(start_count));
    start_count = SystemTime::now();
    services::task::issue(&db, &task_id).await?;
    debug!("issue task: {:?}", SystemTime::now().duration_since(start_count));

    Response::ok((), "任务已下发").to_json()
}

#[get("/task/list")]
pub async fn get_task_list(
    req: HttpRequest,
    client: web::Data<Client>,
    query: web::Query<Query<()>>
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);

    let res = services::task::list(&db, query.0).await?;

    Response::ok(res, None).to_json()
}

#[get("/task/{id}/logs")]
pub async fn get_task_logs(
    req: HttpRequest,
    client: web::Data<Client>,
    path: web::Path<String>,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let db = db::DbApp::get_by_appid(&client, &appid);
    let task_id = path.into_inner();

    let list = services::task::logs(&db, &task_id).await?;

    Response::ok(list, None).to_json()
}
