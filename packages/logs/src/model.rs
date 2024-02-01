use log::error;
use mongodb::bson::DateTime;
use serde::{Deserialize, Serialize};
use serde_json::{Error, Map, Value};

#[derive(Deserialize, Serialize)]
pub struct Captcha {
  key: String,
  offset: usize,
  create_time: String,
}

#[derive(Deserialize, Serialize)]
pub struct LogCommon<T> {
  pub r#type: String,
  pub appid: String,
  pub data: Map<String, Value>,
  pub uuid: String,
  pub create_time: T,
}
pub type Log = LogCommon<DateTime>;
pub type LogRecord = LogCommon<String>;

impl Log {
    pub fn to_string(&self) -> Result<String, Error> {
        let create_time = match DateTime::try_to_rfc3339_string(self.create_time) {
            Ok(time) => time,
            Err(err) => {
                error!("convert create_time to string failed: {}", err);
                String::from("unknown create_time")
            }
        };
        let record = LogRecord {
            r#type: self.r#type.clone(),
            appid: self.appid.clone(),
            data: self.data.clone(),
            uuid: self.uuid.clone(),
            create_time,
        };
        serde_json::to_string(&record)
    }
}

#[derive(Deserialize, Serialize)]
pub struct User {
  pub name: String,
  pub password: String,
}
