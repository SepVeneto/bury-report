use core::time::Duration;
use mongodb::options::IndexOptions;
use mongodb::{Client, Database, IndexModel};
use mongodb::bson::doc;
use crate::model::{self, *};

pub async fn connect_db() -> Database {
  let db_url = std::env::var("REPORT_DB_URL").expect("enviroment missing REPORT_DB_URL");
  let db_name = std::env::var("DB_NAME").expect("enviroment missing DB_NAME");
  let db_pwd = std::env::var("DB_PWD").expect("enviroment missing DB_PWD");
  let uri = format!("mongodb://{name}:{pwd}@{uri}", name=db_name, pwd=db_pwd, uri = db_url);

  let client = Client::with_uri_str(uri).await.expect("failed to connect to Mongo");
  let db = client.database("reporter");

  init_collection(&db).await;

  create_captcha_index(&db).await;
  create_logs_index(&db).await;

  db
}

async fn create_logs_index(db: &Database) {
  let options = IndexOptions::builder()
    .name(String::from("uuid"))
    .build();
  let model = IndexModel::builder()
    .keys(doc! { "data.uuid": 1 })
    .options(options)
    .build();
  logs::Log::collection(db)
    .create_index(model, None)
    .await
    .expect("the index uuid has already been created");
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
    
  const COLLECTIONS: [&str; 6] = [
    model::captcha::NAME,
    model::apps::NAME,
    model::projects::NAME,
    model::users::NAME,
    model::logs::NAME,
    model::source::NAME,
  ];
  let collections = db.list_collection_names(doc! {}).await.unwrap();

  for collection in collections {
    if COLLECTIONS.contains(&collection.as_str()) {
      continue;
    }
    db.create_collection(collection, None).await.expect_err("collection already exists");
  }
}
