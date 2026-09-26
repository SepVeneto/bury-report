mod db;
mod routes;
mod config;
mod apis;
mod model;
mod services;
mod utils;
mod alert;
mod probe;


use std::sync::Arc;
use std::time::Duration;

// use crate::services::actor;

use actix_web::{post, web, App, HttpResponse, HttpServer, Responder};
use log::{info, error};
use rdkafka::ClientConfig;
use rdkafka::producer::Producer;

use crate::services::task::{KafkaProducer, ReportProducerContext};

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
  let flush_client = client.clone();
//   let server = actor::WsActor::new().start();
  // 单条消息上限：必须 ≥ broker/主题侧的上限，否则会在入队时被拒收
  let max_message_bytes = std::env::var("KAFKA_MAX_MESSAGE_BYTES").unwrap_or_else(|_| "10485760".to_string());
  // 抖动窗口：消息在本地队列里最多等这么久（原来是 5s，Kafka 抖一下就丢 track）
  let message_timeout_ms = std::env::var("KAFKA_MESSAGE_TIMEOUT_MS").unwrap_or_else(|_| "120000".to_string());
  // librdkafka 默认队列上限是 1GB，会把容器内存顶爆，这里显式设置
  let queue_max_kbytes = std::env::var("KAFKA_QUEUE_MAX_KBYTES").unwrap_or_else(|_| "262144".to_string());
  let producer: KafkaProducer = ClientConfig::new()
    .set("bootstrap.servers", std::env::var("KAFKA_BROKERS").expect("enviroment missing KAFKA_BROKERS"))
    .set("message.max.bytes", max_message_bytes.clone())
    .set("message.timeout.ms", message_timeout_ms.clone())
    // 幂等生产者：抖动期重试不产生重复，与消费端去重互补
    .set("enable.idempotence", "true")
    .set("acks", "all")
    .set("max.in.flight.requests.per.connection", "5")
    .set("queue.buffering.max.kbytes", queue_max_kbytes.clone())
    .set(
      "queue.buffering.max.messages",
      std::env::var("KAFKA_QUEUE_MAX_MESSAGES").unwrap_or_else(|_| "100000".to_string()),
    )
    // 自定义 context：交付失败不再静默
    .create_with_context(ReportProducerContext)
    .expect("Producer creation error");
  info!(
    "kafka producer ready: max_message_bytes={} message_timeout_ms={} queue_max_kbytes={}（请确认 broker 侧 kafka_batch_max_bytes 不小于 max_message_bytes）",
    max_message_bytes, message_timeout_ms, queue_max_kbytes
  );
  let producer_data = web::Data::new(Arc::new(producer));
  let producer_for_shutdown = producer_data.get_ref().clone();

  // 交付回调只在 poll 时触发；不 poll 就永远不知道消息是否真的进了 Kafka
  let poll_producer = producer_data.get_ref().clone();
  tokio::spawn(async move {
    let mut ticker = tokio::time::interval(Duration::from_millis(500));
    loop {
      ticker.tick().await;
      poll_producer.poll(Duration::from_millis(0));
    }
  });

  if let Err(err) = alert::init(&client).await {
    error!("告警规则/事实初始化失败，将以空规则启动: {}", err);
  }

  // 聚合与内存回收循环必须独立于初始化：init 失败（例如启动时 Mongo 不可达）时，
  // 这条循环仍然要跑，否则 SUMMARY_MAP / ALERT_MAP 永不回收且聚合不再入库。
  let gc_client = client.clone();
  tokio::spawn(async move {
    alert::gc::run_flush(gc_client).await;
  });
  tokio::spawn(async move {
    alert::gc::run_watchdog().await;
  });

  // 运行态探针：定期打点 FD/CLOSE_WAIT/RSS/Mongo 连接数/内存 map 条目数
  let probe_client = client.clone();
  let probe_producer = producer_data.get_ref().clone();
  tokio::spawn(async move {
    probe::run(probe_producer, probe_client).await;
  });

  info!("starting HTTP server at http://localhost:8870");
  let server = HttpServer::new(move || {
    App::new()
      .app_data(web::PayloadConfig::new(10 * 1024 * 1024))
      .app_data(web::Data::new(client.clone()))
      .app_data(web::Data::new(db.clone()))
    //   .app_data(web::Data::new(server.clone()))
      .app_data(producer_data.clone())
    //   .wrap(middleware::Auth)
      .configure(routes::services)
  })
  .bind(("0.0.0.0", 8870))?
  // 关掉 actix 自带的信号处理：它收到 SIGINT/SIGTERM 会直接 forced shutdown，
  // 抢在下面这段优雅退出（先 flush Kafka、再落库聚合）之前把进程带下去
  .disable_signals()
  .run();


  let handle = server.handle();

  actix_web::rt::spawn(async move {
    // docker stop 发的是 SIGTERM，Ctrl-C 是 SIGINT，两者都要走优雅退出
    #[cfg(unix)]
    let signal_name = {
        let mut sigterm = match tokio::signal::unix::signal(
            tokio::signal::unix::SignalKind::terminate(),
        ) {
            Ok(sig) => sig,
            Err(e) => {
                error!("Unable to listen for SIGTERM: {}", e);
                return;
            }
        };
        tokio::select! {
            _ = tokio::signal::ctrl_c() => "SIGINT",
            _ = sigterm.recv() => "SIGTERM",
        }
    };
    #[cfg(not(unix))]
    let signal_name = {
        if let Err(e) = tokio::signal::ctrl_c().await {
            error!("Unable to listen for shutdown signal: {}", e);
            return;
        }
        "SIGINT"
    };
    info!("received {}, shutting down gracefully", signal_name);

    info!("Flushing Kafka producer...");
    let _ = producer_for_shutdown.flush(Duration::from_secs(5));
    info!("Kafka producer flushed, shutdown complete.");

    info!("Flushing alert fact & summary...");
    // 聚合落库加超时：不能让优雅退出拖到被 SIGKILL，那样最后一批聚合反而会丢
    match tokio::time::timeout(Duration::from_secs(15), alert::gc::alert_flush(&flush_client)).await {
        Ok(()) => info!("alert fact & summary flushed."),
        Err(_) => error!("聚合落库超时(15s)，跳过并继续退出"),
    }

    info!("Shutdown signal received, stopping server...");
    handle.stop(true).await;
  });

  info!("HTTP server running.");
  server.await
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
