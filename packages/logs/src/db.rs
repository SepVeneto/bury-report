use bson::{Document, doc};
use mongodb::{Client, Database, IndexModel, error::Result};
use log::{error, debug};

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

  let client = Client::with_uri_str(uri).await.expect("failed to connect to Mongo");
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