mod db;
mod routes;
mod config;
mod apis;
mod model;
mod services;
mod middleware;
mod utils;


use crate::services::actor;

use actix::Actor;
use actix_web::{post, web, App, HttpResponse, HttpServer, Responder};
use db::init_db;
use log::{info, error};
use tokio_cron_scheduler::{JobScheduler, Job};

#[post("/verify_ticket")]
async fn ticket(req_body: String) -> impl Responder {
  println!("{req_body}");
  HttpResponse::Ok()
}

// struct AppState {
//     ws_list: Mutex<>
// }

#[actix_web::main]
async fn main() -> std::io::Result<()> {
  dotenv::from_filename(".env.local").ok();

  init_log();

  let (client, db) = db::connect_db().await;
  init_db(&db).await;
  let sched = init_sched().await;
  let server = actor::WsActor::new().start();

  info!("starting HTTP server at http://localhost:8870");
  HttpServer::new(move || {
    App::new()
      .app_data(web::Data::new(client.clone()))
      .app_data(web::Data::new(db.clone()))
      .app_data(web::Data::new(server.clone()))
      .app_data(web::Data::new(sched.clone()))
      .wrap(middleware::Auth)
      .configure(routes::services)
  })
  .bind(("0.0.0.0", 8870))?
  .run()
  .await
}

async fn init_sched() -> JobScheduler {
    let sched = JobScheduler::new().await.unwrap();
    sched.add(
        // 每天分别清理最近3天的请求日志，30天的错误日志，7天的常规上报日志
        // 每天收集并清理用户的设备信息
        // 系统默认协调时间时，比北京晚8个小时
        Job::new_async("0 0 16 1/1 * *", |_uuid, _l|{
        // Job::new_async("0 1/1 * * * *", |_uuid, _l|{
            info!("starting gc...");
            Box::pin(async move {
                let (client, _) = crate::db::connect_db().await;
                
                let db = client.database("reporter");
                let config = crate::services::config::get_config(&db).await.unwrap_or_default();
                info!("set config: {:?}", config);
                if let Err(err) = services::apps::gc_info(&client, 1).await {
                    error!("{}", err.to_string());
                }
                if let Err(err) = services::apps::gc_networks(&client, config.cycle_api).await {
                    error!("{}", err.to_string());
                }
                if let Err(err) = services::apps::gc_errors(&client, config.cycle_log).await {
                    error!("{}", err.to_string());
                }
                if let Err(err) = services::apps::gc_logs(&client, config.cycle_log).await {
                    error!("{}", err.to_string());
                }
            })
        }).unwrap()
    ).await.unwrap();
    sched.start().await.unwrap();
    sched
}
fn init_log() {
  use std::io::Write;
  use chrono::Local;

  let env = env_logger::Env::default()
    .filter_or(
        env_logger::DEFAULT_FILTER_ENV,
        std::env::var("LOG_LEVEL").unwrap_or("info".to_string())
    );
  env_logger::Builder::from_env(env)
    .format(|buf, record| {
      writeln!(
        buf,
        "{} {} [{}] {}",
        Local::now().format("%Y-%m-%d %H:%M:%S"),
        record.level(),
        record.module_path().unwrap_or("<unnamed>"),
        &record.args(),
      )
    })
    .init();
  info!("env_logger initialized.");
}
