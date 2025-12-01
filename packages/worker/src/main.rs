mod db;

use std::env::VarError;
use std::io::Write;
use std::str::FromStr;
use std::io::Read;
use http::{HeaderMap, HeaderValue};

use log::{info, debug, error};
use qcos::acl::AclHeader;
use qcos::objects::mime::Mime;
use qcos::client::Client;
use qcos::request::ErrNo;
use rdkafka::{ClientConfig, Message};
use rdkafka::consumer::{Consumer, StreamConsumer};
use futures::StreamExt;
use redis::{AsyncCommands, RedisError, RedisResult};
use redis::aio::MultiplexedConnection;

use crate::db::{connect_db, link_db, update_event};

const REDIS_ZSET: &str = "session:index";

#[tokio::main]
async fn main() -> redis::RedisResult<()> {
    init_log();

    debug!("start with debug");
    info!("Worker started");
    dotenv::from_filename(".env.local").ok();
    let expire_time_str = std::env::var("EXPIRE_TIME").unwrap_or("600".to_string());
    let expire_time: u64 = expire_time_str.parse().expect("expire_time must be unsigned number");

    let cos = init_cos().unwrap();
    let (client, _db) = connect_db().await;

    let mut conn = init_redis(&cos, &client).await.unwrap();
    let now = chrono::Local::now().timestamp();
    info!("scanning expired sessions at {}", now);
    let expired_sessions: Vec<String> = conn
      .zrangebyscore(REDIS_ZSET, "-inf", now)
      .await?;

    info!("expired sessions: {:?}", expired_sessions);
    compensate_sessions(&mut conn, &cos, client, expired_sessions).await?;

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
          debug!("Received message: {:?}", &m);
          if let Some(session) = m.key() {
            let session = String::from_utf8_lossy(session).to_string();
            match m.payload_view::<str>() {
              Some(Ok(s)) => {
                debug!("enter?, {}", s);
                let session_key = gen_key(&session);
                let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
                let _ = encoder.write_all(s.as_bytes()).expect("gzip encoder write fail");
                let compressed = encoder.finish().expect("gzip failed");
                let _: Result<String, RedisError> = conn.rpush(&session_key, compressed).await;
                // 会话数据的过期时间是shadow key的两倍，默认是20分钟
                let _: Result<(), RedisError> = conn.expire(&session_key, expire_time as i64 * 2).await;
                let _: Result<(), RedisError> = conn.set_ex(gen_shadow_key(&session), "",  expire_time).await;
                let _: Result<(), RedisError> = conn.zadd(REDIS_ZSET, &session, get_expire_time(expire_time)).await;
              },
              Some(Err(e)) => {
                info!("Error while decoding payload: {}", e);
              },
              None => {
                info!("Message payload is null");
              }
            };
          }
        },
        Err(e) => {
          info!("Error while receiving message: {}", e);
        }
      }
    }

    Ok(())
}

fn init_cos() -> Result<Client, VarError> {
    let secrect_id = std::env::var("SECRECT_ID")?;
    let secrect_key = std::env::var("SECRECT_KEY")?;
    let bucket = std::env::var("BUCKET")?;
    let region = std::env::var("REGION")?;


    let mut client = Client::new(
        secrect_id,
        secrect_key,
        bucket,
        region,
    );
    let mut headers = HeaderMap::new();
    match HeaderValue::from_str("gzip") {
      Ok(val) => {
        headers.insert("Content-Encoding", val);
      },
      Err(e) => {
        info!("Error while setting Content-Encoding header: {}", e);
      }
    }
    client.with_custom_headers(headers);

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

async fn init_redis(cos: &Client, db_client: &mongodb::Client) -> redis::RedisResult<MultiplexedConnection> {
  let redis= std::env::var("REDIS").expect("enviroment missing REDIS");
  let redis_url = format!("redis://{}", redis);
  let client = redis::Client::open(redis_url)?;
  let conn = client.get_multiplexed_tokio_connection().await?;

  let mut pubsub_conn: redis::aio::PubSub = client.get_async_pubsub().await?;
  pubsub_conn.psubscribe("__keyevent@0__:expired").await?;

  let conn_clone = conn.clone();
  let cos_clone = cos.clone();

  let db_client = db_client.clone();
  tokio::spawn(async move {
    if let Err(e) = process_message(pubsub_conn, conn_clone, &cos_clone, db_client).await {
        eprintln!("Error in task: {}", e);
    };
  });

  Ok(conn)
}

async fn process_message(
  mut pubsub: redis::aio::PubSub,
  mut conn: MultiplexedConnection,
  cos: &Client,
  client: mongodb::Client,
) -> Result<(), Box<dyn std::error::Error>> {
  let mut msg_stream = pubsub.on_message();
  debug!("redis pubsub started");
  while let Some(msg) = msg_stream.next().await {
    match msg.get_payload::<String>() {
      Ok(key) => {
        debug!("expired key: {}", key);
        if let Some(session) = extract_session(&key) {
          match upload_session(&mut conn, &cos, &client, &session).await {
            Ok(store_key) => {
              let _: Result<(), RedisError> = conn.zrem(REDIS_ZSET, &session).await;
              let _: Result<(), RedisError> = conn.del(&store_key).await;
            },
            Err(e) => {
              info!("Error while uploading session: {}", e);
            }
          }
        }
      },
      Err(e) => {
        info!("Error while receiving message: {}", e);
      }
    }
  }
  Ok(())
}

fn gen_key(session: &str) -> String {
  let key = format!("session:{}:data", session);
  key
}

fn gen_shadow_key(session: &str) -> String {
  let key = format!("session:{}:shadow", session);
  key
}

fn get_expire_time(expire_time: u64) -> i64 {
  let now = chrono::Local::now();
  let expire_time = now + chrono::Duration::seconds(expire_time as i64);
  expire_time.timestamp()
}

fn extract_session(key: &str) -> Option<String> {
  let parts: Vec<&str> = key.split(":").collect();
  match parts.as_slice() {
    ["session", session, "shadow"] => Some(session.to_string()),
    _ => None
  }
}

fn decompress_gzip(data: &[u8]) -> Result<String, std::io::Error> {
  let mut decoder = flate2::read::GzDecoder::new(data);
  let mut decompressed_data = String::new();
  decoder.read_to_string(&mut decompressed_data)?;
  Ok(decompressed_data)
}

fn compress_gzip(data: &[u8]) -> Result<Vec<u8>, std::io::Error> {
  let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
  encoder.write_all(data)?;
  encoder.finish()
}

async fn compensate_sessions(
  conn: &mut MultiplexedConnection,
  cos: &Client,
  client: mongodb::Client,
  expired_sessions: Vec<String>
) -> redis::RedisResult<()> {
  for session in expired_sessions {
    let shadow_key = gen_shadow_key(&session);
    if conn.exists(shadow_key).await? {
      continue;
    }

    info!("Compensating session: {}", session);

    match upload_session(conn, cos, &client, &session).await {
      Ok(store_key) => {
        let _: Result<(), RedisError> = conn.zrem(REDIS_ZSET, &session).await;
        let _: Result<(), RedisError> = conn.del(&store_key).await;
      },
      Err(e) => {
        error!("Error while compensating session: {}", e);
      }
    }
  }

  Ok(())
}

async fn upload_session(
  conn: &mut MultiplexedConnection,
  cos: &Client,
  client: &mongodb::Client,
  session: &str,
) -> RedisResult<String> {
  let store_key = gen_key(&session);
  let res: Vec<Vec<u8>> = conn.lrange(&store_key, 0, -1).await.unwrap();
  if let Some((appid, session)) = parse_key(&session) {
    let now = chrono::Local::now().timestamp_millis();
    let path = format!("/session/{appid}/{session}-{stamp}.json.gz", appid=&appid, session=&session, stamp=now);
    let url = cos.get_full_url_from_path(&path);
    info!("uploading to: {}", url);
    // let joined = format!("[{}]", res.join(","));

    let cos_clone = cos.clone();
    let db = link_db(&client, &appid);
    tokio::spawn(async move {
      let mut decompressed_list = Vec::new();
      for batch in res {
        match decompress_gzip(&batch) {
          Ok(decompressed) => {
            decompressed_list.push(decompressed);
          }
          Err(e) => {
            info!("Error while decompressing payload: {}", e);
          }
        }
      }
      let joined = format!("[{}]", decompressed_list.join(","));
      let bytes = joined.as_bytes();
      match compress_gzip(bytes) {
        Ok(res) => {
                
          let mut acl_header = AclHeader::new();
          acl_header.insert_object_x_cos_acl(qcos::acl::ObjectAcl::PRIVATE);
          let res = cos_clone.put_object_binary(
            res,
            &path,
            Some(Mime::from_str("application/gzip").expect("mime failed")),
            Some(acl_header),
          ).await;
          if res.error_no == ErrNo::SUCCESS {
            info!("Upload to: {:?}", url);
            if let Err(err) = update_event(&db, &session, &url).await {
              error!("Error while updating event: {}", err);
            }
            println!("put object success");
          } else {
            println!("put object failed, [{}]: {}", res.error_no, res.error_message);
          }
        },
        Err(e) => {
          info!("Error while compressing payload: {}", e);
        }
      }
    });
  }
  Ok(store_key)
}

fn parse_key(session: &str) -> Option<(String, String)> {
  let parts: Vec<&str> = session.split("/").collect();
  match parts.as_slice() {
    [appid, session] => Some((appid.to_string(), session.to_string())),
    _ => None
  }
}
