use actix_web::{HttpRequest, get, web};
use mongodb::Client;

use crate::{
    apis::{ApiResult, get_appid},
    services::{task, Response},
};

pub fn init_service(config: &mut web::ServiceConfig) {
  config.service(sync_alert_rule);
}

#[get("/notify/sync-alert-rule")]
async fn sync_alert_rule(
    client: web::Data<Client>,
    req: HttpRequest,
) -> ApiResult {
    let appid = get_appid(&req)?;
    let app_name = format!("app_{}", appid);
    let db = client.database(&app_name);
    task::sync_alert_rule(&db, &app_name).await?;
    Response::ok("", None).to_json()
}
