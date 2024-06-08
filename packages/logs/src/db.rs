use core::time::Duration;
use log::info;
use mongodb::options::IndexOptions;
use mongodb::{Client, Database, IndexModel};
use mongodb::bson::doc;
use crate::model::{self, *};

pub struct DbApp {}

impl DbApp {
    pub fn get_db_name(appid: &str) -> String {
        format!("app_{}", appid)
    }
    pub fn get_by_appid(client: &Client, appid: &str) -> Database {
        let db_name = Self::get_db_name(appid);
        client.database(&db_name)
    }
    pub fn create_by_appid(client: &Client, appid: &str) -> Database {
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

  (client, db)
}

async fn create_cols_from_apps(db: &Database)  {
    // db.collection("apps")
}

pub async fn init_db(db: &Database) {
    init_collection(db).await;
    init_index(db).await;
}

async fn init_index(db: &Database) -> () {
    create_captcha_index(db).await;
}

async fn create_captcha_index(db: &Database) {
  let options = IndexOptions::builder()
    .name(String::from("create_time"))
    .expire_after(Duration::new(3 * 60, 0))
    .build();
  let model = IndexModel::builder()
    .keys(doc! { "create_time": 1 })
    .options(options)
    .build();

  captcha::Model::collection(db)
    .create_index(model, None)
    .await
    .expect("the index create_time has already been created");
}

async fn init_collection(db: &Database) {
    
  const COLLECTIONS: [&str; 4] = [
    model::captcha::NAME,
    model::apps::NAME,
    model::projects::NAME,
    model::users::NAME,
  ];
  let collections = db.list_collection_names(doc! {}).await.unwrap();

  for collection in COLLECTIONS {
    info!("check collection: {}", collection);
    if collections.contains(&collection.to_string()) {
      continue;
    }
    info!("create collection: {}", collection);
    db.create_collection(&collection, None).await.unwrap();
  }
}
