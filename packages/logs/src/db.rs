use std::time::Duration;

use bson::{Document, doc};
use mongodb::{
    Client, Database, IndexModel,
    error::Result,
    options::{ClientOptions, IndexOptions},
};
use log::{error, warn, debug, info};

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

  // 连接池必须有上限，否则并发一高就会按并发数开连接（线上出现过 500+ ESTABLISHED、FD/内存只增不减）
  // 注意：驱动自己的默认上限是 10（DEFAULT_MAX_POOL_SIZE）。线上出现的是"连接远多于上限"，
  // 所以这里不是"调大就好"的问题；默认取 50（比 10 宽松但仍有限），要回到驱动默认就设 MONGO_MAX_POOL_SIZE=10
  let max_pool_size = env_u32("MONGO_MAX_POOL_SIZE", 50);
  let min_pool_size = env_u32("MONGO_MIN_POOL_SIZE", 1);
  let max_idle_secs = env_u64("MONGO_MAX_IDLE_SECS", 60);
  let select_timeout = env_u64("MONGO_SELECT_TIMEOUT_SECS", 10);

  let mut options = ClientOptions::parse(&uri)
    .await
    .expect("failed to parse Mongo uri");
  options.app_name = Some("bury-report-logs".to_string());
  options.max_pool_size = Some(max_pool_size);
  options.min_pool_size = Some(min_pool_size);
  // 0 表示关闭空闲回收（回到驱动原行为）；>0 才会主动回收空闲连接
  options.max_idle_time = if max_idle_secs == 0 {
    None
  } else {
    Some(Duration::from_secs(max_idle_secs))
  };
  options.connect_timeout = Some(Duration::from_secs(select_timeout));
  options.server_selection_timeout = Some(Duration::from_secs(select_timeout));

  let client = Client::with_options(options).expect("failed to create Mongo client");
  info!(
    "mongo pool: max={} min={} max_idle={}s select_timeout={}s",
    max_pool_size, min_pool_size, max_idle_secs, select_timeout
  );
  let db = client.database("reporter");

  if let Err(err) = init_db(&client).await {
    error!("init db error: {}", err);
  }

  (client, db)
}

fn env_u32(key: &str, default: u32) -> u32 {
    std::env::var(key).ok().and_then(|v| v.parse().ok()).unwrap_or(default)
}

fn env_u64(key: &str, default: u64) -> u64 {
    std::env::var(key).ok().and_then(|v| v.parse().ok()).unwrap_or(default)
}

/// 索引冲突（同键不同选项/名字），旧库上已存在同键普通索引时会出现
fn is_index_conflict(err: &mongodb::error::Error) -> bool {
    match err.kind.as_ref() {
        mongodb::error::ErrorKind::Command(cmd) => cmd.code == 85 || cmd.code == 86,
        _ => false,
    }
}


async fn init_db(client: &Client) -> Result<()>{
    let cols = [
        logs_error::Model::NAME,
        logs_network::Model::NAME,
        logs::Model::NAME,
        logs::Session::NAME,
        logs::Device::NAME
    ];
    // 需要唯一索引的集合：并发下"先查再插"会写出重复文档（线上核查到同 session 多条）
    let unique_cols: [(&str, &str); 3] = [
        (logs::Session::NAME, "session"),
        (logs::Device::NAME, "uuid"),
        (logs::CustomId::NAME, "id"),
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
                    // 需要唯一索引的列不再建普通索引：Mongo 不允许同键不同选项的两个索引共存
                    for key in ["session", "uuid"] {
                        if unique_cols.iter().any(|(c, k)| c == col && *k == key) {
                            continue;
                        }
                        let index = IndexModel::builder().keys(doc! { key: 1 }).build();
                        db.collection::<Document>(col).create_index(index, None).await?;
                    }
                }
                for (col, key) in unique_cols {
                    // 必须显式命名：默认名字会和上面已建的普通索引同名，导致 IndexOptionsConflict
                    let index = IndexModel::builder()
                        .keys(doc! { key: 1 })
                        .options(
                            IndexOptions::builder()
                                .name(format!("uniq_{}", key))
                                .unique(true)
                                .build(),
                        )
                        .build();
                    if let Err(err) = db.collection::<Document>(col).create_index(index, None).await {
                        // 老库上已存在同键的普通索引（session_1 / uuid_1）：先删掉再建唯一索引
                        if is_index_conflict(&err) {
                            let plain = format!("{}_1", key);
                            debug!("删除旧的普通索引 {}.{} 后改建唯一索引", db.name(), plain);
                            if let Err(drop_err) = db
                                .collection::<Document>(col)
                                .drop_index(plain.clone(), None)
                                .await
                            {
                                warn!("删除旧索引 {}.{} 失败: {}", db.name(), plain, drop_err);
                            }
                            let retry = IndexModel::builder()
                                .keys(doc! { key: 1 })
                                .options(
                                    IndexOptions::builder()
                                        .name(format!("uniq_{}", key))
                                        .unique(true)
                                        .build(),
                                )
                                .build();
                            if let Err(err) = db
                                .collection::<Document>(col)
                                .create_index(retry, None)
                                .await
                            {
                                warn!(
                                    "创建唯一索引仍失败 {}.{}（可能有历史重复数据，需先清理）: {}",
                                    db.name(), key, err
                                );
                            }
                        } else {
                            warn!(
                                "创建唯一索引失败 {}.{}（可能存在历史重复数据，需先清理）: {}",
                                db.name(), key, err
                            );
                        }
                    }
                }
            }
            Err(err) => {
                error!("{}", err)
            }
        }


    }

    Ok(())
}
