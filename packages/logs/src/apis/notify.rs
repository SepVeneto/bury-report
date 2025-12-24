use actix_web::{HttpRequest, get, web};
use mongodb::Client;
use log::{debug, error};

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
    let notify_token = std::env::var("NOTIFY_TOKEN").unwrap_or("".to_string());
    let headers = req.headers();
    let remote_token = headers.get("notify-token");
    if let Some(token) = remote_token {
        let token = token.to_str().unwrap_or("").to_string();
        let is_valid = token == notify_token;
        if !is_valid {
            error!("invalid notify token");
            return Response::ok("", None).to_json();
        }
        debug!("sync alert rule");
        let appid = get_appid(&req)?;
        let app_name = format!("app_{}", appid);
        let db = client.database(&app_name);
        task::sync_alert_rule(&db, &app_name).await?;
        Response::ok("", None).to_json()
    } else {
        error!("missing notify token");
        Response::ok("", None).to_json()
    }
}
