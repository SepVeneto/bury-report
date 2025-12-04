use mongodb::{Client, Database, bson::{DateTime, Document, doc}, results::UpdateResult};

pub async fn connect_db() -> (Client, Database) {
  let db_url = std::env::var("REPORT_DB_URL").expect("enviroment missing REPORT_DB_URL");
  let db_name = std::env::var("DB_NAME").expect("enviroment missing DB_NAME");
  let db_pwd = std::env::var("DB_PWD").expect("enviroment missing DB_PWD");
  let uri = format!("mongodb://{name}:{pwd}@{uri}", name=db_name, pwd=db_pwd, uri = db_url);

  let client = Client::with_uri_str(uri).await.expect("failed to connect to Mongo");
  let db = client.database("reporter");

  (client, db)
}

pub fn link_db(client: &Client, appid: &str) -> Database {
  let name = format!("app_{appid}", appid=appid);
  client.database(&name)
}

pub async fn update_event (
  db: &Database,
  session: &str,
  event_url: &str
) -> Result<UpdateResult, mongodb::error::Error> {
  let col = db.collection::<Document>("records_session");
  col.update_one(
    doc! {
      "session": session
    },
    doc! {
      "$push": {
        "event_urls": event_url
      },
      "$set": {
        "update_time": DateTime::now(),
      }
    },
    None
  ).await
}

