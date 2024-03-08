use log::error;
use mongodb::bson::DateTime;
use serde::{Deserialize, Serialize};
use serde_json::{Error, Map, Value};
use std::sync::Arc;
use mongodb::{Database, Collection};

pub const NAME: &str = "logs";

#[derive(Deserialize, Serialize)]
pub struct Model<T = DateTime> {
  pub r#type: String,
  pub appid: String,
  pub data: Map<String, Value>,
  pub uuid: String,
  pub create_time: T,
}
pub type Log = Model<DateTime>;
pub type LogRecord = Model<String>;

impl<T> Model<T> {
    pub fn collection(db: &Arc<Database>) -> Collection<Log> {
        db.collection::<Log>(NAME)
    }
}

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