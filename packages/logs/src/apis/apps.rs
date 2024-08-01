use actix_web::{put, delete, get, post, web, HttpRequest};
use bson::doc;
use mongodb::{Client, Database};
use serde::{Deserialize, Serialize};

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

// pub async fn execute_task(
//     req: HttpRequest,
//     client: web::Data<Client>,
// ) -> ApiResult {
//     let appid = get_appid(&req)?;
//     let db = db::DbApp::get_by_appid(&client, &appid);

//     services::task::execute(&db, id)
// }
