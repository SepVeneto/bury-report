use mongodb::{Client, Database};

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

  (client, db)
}
