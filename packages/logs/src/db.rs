use bson::{Document, doc};
use mongodb::{Client, Database, IndexModel, error::Result, options::ClientOptions};
use std::time::Duration;
use log::{error, debug, info};

use crate::model::{BaseModel, logs, logs_error, logs_network, apps};

pub struct DbApp {}

impl DbApp {
    pub fn get_db_name(appid: &str) -> String {
        format!("app_{}", appid)
    }
    pub fn get_by_appid(client: &Client, appid: &str) -> Database {
        let db_name = Self::get_db_name(appid);
        client.database(&db_name)
    }
}

pub async fn connect_db() -> (Client, Database) {
  let db_url = std::env::var("REPORT_DB_URL").expect("enviroment missing REPORT_DB_URL");
  let db_name = std::env::var("DB_NAME").expect("enviroment missing DB_NAME");
  let db_pwd = std::env::var("DB_PWD").expect("enviroment missing DB_PWD");
  let uri = format!("mongodb://{name}:{pwd}@{uri}", name=db_name, pwd=db_pwd, uri = db_url);

  let mut client_options = ClientOptions::parse(uri)
      .await
      .expect("failed to parse MongoDB connection string");
  // Bound the number of application sockets and recycle idle connections before
  // MongoDB or an intermediary closes them first.
  // 连接数上限：默认沿用驱动默认值 10（线上是"连接数远超上限"，调大不是修复方向），需要时用环境变量调
  let max_pool_size = env_u32("MONGO_MAX_POOL_SIZE", 10);
  // 空闲回收默认关闭（保持驱动原行为），需要时用 MONGO_MAX_IDLE_SECS 打开；0 = 关闭
  let max_idle_secs = env_u64("MONGO_MAX_IDLE_SECS", 0);
  client_options.max_pool_size = Some(max_pool_size);
  client_options.max_idle_time = if max_idle_secs == 0 {
      None
  } else {
      Some(Duration::from_secs(max_idle_secs))
  };
  let client = Client::with_options(client_options).expect("failed to configure MongoDB client");
  info!("mongo pool: max={} max_idle={}s", max_pool_size, max_idle_secs);
  let db = client.database("reporter");

  if let Err(err) = init_db(&client).await {
    error!("init db error: {}", err);
  }

  (client, db)
}


async fn init_db(client: &Client) -> Result<()>{
    let cols = [
        logs_error::Model::NAME,
        logs_network::Model::NAME,
        logs::Model::NAME,
        logs::Session::NAME,
        logs::Device::NAME
    ];
    let reporter = client.database("reporter");
    let mut apps = reporter.collection::<apps::Model>("apps").find(doc! {
        "is_delete": { "$ne": true }
    }, None).await?;
    while apps.advance().await? {
        let app = apps.current();
        match app.get_object_id("_id") {
            Ok(id) => {
                let db_name = format!("app_{}", id.to_string());
                let db = client.database(&db_name);
                debug!("create indexs for app {}", db.name());
                for col in &cols {
                    let session_index = IndexModel::builder().keys(doc! { "session": 1 }).build();
                    let uuid_index = IndexModel::builder().keys(doc! {"uuid": 1}).build();
                    db.collection::<Document>(col).create_index(session_index, None).await?;
                    db.collection::<Document>(col).create_index(uuid_index, None).await?;
                }
            }
            Err(err) => {
                error!("{}", err)
            }
        }


    }

    Ok(())
}
fn env_u32(key: &str, default: u32) -> u32 {
    std::env::var(key).ok().and_then(|v| v.parse().ok()).unwrap_or(default)
}

fn env_u64(key: &str, default: u64) -> u64 {
    std::env::var(key).ok().and_then(|v| v.parse().ok()).unwrap_or(default)
}
