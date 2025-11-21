use std::env::VarError;
use std::path::PathBuf;

use log::info;
use qcos::objects::mime;
use qcos::client::Client;
use qcos::request::ErrNo;
use rdkafka::{ClientConfig, Message};
use rdkafka::consumer::{Consumer, StreamConsumer};
use futures::StreamExt;
use redis::AsyncCommands;
use redis::aio::MultiplexedConnection;



#[tokio::main]
async fn main() {
  init_log();

  info!("Worker started");
    dotenv::from_filename(".env.local").ok();

    let conn = init_redis().await.unwrap();

    let brokers = std::env::var("KAFKA_BROKERS").expect("enviroment missing KAFKA_BROKERS");
    let consumer: StreamConsumer = ClientConfig::new()
      .set("bootstrap.servers", brokers)
      .set("group.id", "bury-report-consumer")
      .set("enable.partition.eof", "false")
      .set("session.timeout.ms", "6000")
      .set("enable.auto.commit", "true")
      .create()
      .expect("Consumer creation failed");
  
    consumer.subscribe(&["rrweb"]).expect("Consumer subscribe failed");

    info!("Consumer started, waiting for messages...");

    let mut message_stream = consumer.stream();

    while let Some(message) = message_stream.next().await {
      match message {
        Ok(m) => {
          let payload = match m.payload_view::<str>() {
            Some(Ok(s)) => {
              // TODO
              conn.set("test", s).await.unwrap();
            },
            Some(Err(e)) => {
              info!("Error while decoding payload: {}", e);
            },
            None => {
              info!("Message payload is null");
            }
          };

          info!("Received message: {:?} with {:?}", m.key(), payload);
        },
        Err(e) => {
          info!("Error while receiving message: {}", e);
        }
      }
    }


    // if let Ok(client) = init_cos() {
    //   let res = client.put_object(
    //     &PathBuf::from("Cargo.toml"),
    //     "Cargo.toml",
    //     Some(mime::TEXT_PLAIN_UTF_8),
    //     None,
    //   ).await;

    //   if res.error_no == ErrNo::SUCCESS {
    //     println!("put object success");
    //   } else {
    //     println!("put object failed, [{}]: {}", res.error_no, res.error_message);
    //   }
    // } else {
    //   panic!("init cos failed");
    // }
}

fn init_cos() -> Result<Client, VarError> {
    let secrect_id = std::env::var("SECRECT_ID")?;
    let secrect_key = std::env::var("SECRECT_KEY")?;
    let bucket = std::env::var("BUCKET")?;
    let region = std::env::var("REGION")?;


    let client = Client::new(
        secrect_id,
        secrect_key,
        bucket,
        region,
    );

    Ok(client)
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

async fn init_redis() -> redis::RedisResult<MultiplexedConnection> {
  let client = redis::Client::open("redis://redis:6379")?;
  let conn = client.get_multiplexed_async_connection().await?;

  Ok(conn)
}
