use mongodb::{bson::{doc, DateTime}, results::InsertManyResult};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use mongodb::{Database, Collection};

use super::QueryResult;

pub const NAME: &str = "logs";

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum RecordPayload {
    V1(RecordV1),
    V2(RecordV2),
}
impl RecordPayload {
    pub fn get_appid(&self) -> String {
        match self {
            RecordPayload::V1(v1) => v1.appid.to_owned(),
            RecordPayload::V2(v2) => v2.appid.to_owned(),
        }
    }
    pub fn normalize(&self) -> Vec<Log> {
        match self {
            RecordPayload::V1(v1) => vec![Self::normalize_from(v1.clone())],
            RecordPayload::V2(v2) => {
                let data = v2.data.clone();
                let res = data.into_iter().map(|item| Self::normalize_from(item));
                res.collect()
            }
        }
    }
    pub fn to_string(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
    pub fn normalize_from(record: RecordV1) -> Log {
        Log {
            r#type: record.r#type,
            uuid: record.uuid,
            appid: record.appid,
            data: record.data,
            create_time: DateTime::now(),
        }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct RecordV1 {
  pub r#type: String,
  pub appid: String,
  pub data: Map<String, Value>,
  pub uuid: String,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct RecordV2 {
  pub appid: String,
  pub data: Vec<RecordV1>,
}




pub struct Filter {
    pub r#type: Option<String>,
    pub appid: Option<String>,
    pub uuid: Option<String>,
}
#[derive(Deserialize, Serialize)]
pub struct Model {
  pub r#type: String,
  pub appid: String,
  pub data: Map<String, Value>,
  pub uuid: String,
//   #[serde(serialize_with = "serialize_create_time")]
  pub create_time: DateTime,
}
pub type Log = Model;

impl Model {
    pub fn collection(db: &Database) -> Collection<Log> {
        db.collection::<Log>(NAME)
    }
    pub async fn insert_many(db: &Database, data: &RecordPayload) -> QueryResult<InsertManyResult>{
        let records = data.normalize();
        Ok(Self::collection(db).insert_many(records, None).await?)
    }
}
