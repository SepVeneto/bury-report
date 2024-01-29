mod db;
mod routes;
mod config;
mod apis;
mod model;

use actix_web::{post, App, HttpServer, Responder, HttpResponse, web};
use dotenv::dotenv;
use log::info;

#[post("/verify_ticket")]
async fn ticket(req_body: String) -> impl Responder {
  println!("{req_body}");
  HttpResponse::Ok()
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
  dotenv().ok();

  init_log();

  let database = db::connect_db().await;

  HttpServer::new(move || {
    App::new()
      .app_data(web::Data::new(database.clone()))
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
    .filter_or(env_logger::DEFAULT_FILTER_ENV, "info");
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
