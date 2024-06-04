mod db;
mod routes;
mod config;
mod apis;
mod model;
mod services;
mod middleware;

use crate::services::actor;

use actix::Actor;
use actix_web::{post, web, App, HttpResponse, HttpServer, Responder};
use log::info;

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

  let database = db::connect_db().await;

  let server = actor::WsActor::new().start();

  info!("starting HTTP server at http://localhost:8870");
  HttpServer::new(move || {
    App::new()
      .app_data(web::Data::new(database.clone()))
      .app_data(web::Data::new(server.clone()))
      .wrap(middleware::Auth)
      .configure(routes::services)
  })
  .bind(("0.0.0.0", 8870))?
  .run()
  .await
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
