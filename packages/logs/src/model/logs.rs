use std::fmt::Debug;

use futures_util::StreamExt;
use mongodb::{
    bson::{doc, DateTime, Document, from_document},
    Database,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{Map, Value};
use super::{
    logs_error, logs_network, serialize_time, BaseModel, CreateModel, DeleteModel, EditModel, PaginationModel, QueryModel, QueryResult
};

pub const NAME: &str = "records_log";

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
            device_time: record.time,
        }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct RecordV1 {
  pub r#type: String,
  pub appid: String,
  pub data: Map<String, Value>,
  pub uuid: String,
  pub time: Option<String>,
}
const TYPE_LOG: &'static str = "__BR_COLLECT_INFO__";
const TYPE_NETWORK: &'static str = "__BR_API__";
const TYPE_ERROR: &'static str = "__BR_COLLECT_ERROR__";

#[derive(Clone, Debug)]
pub enum RecordItem {
    Log(Model),
    Network(logs_network::Model),
    Error(logs_error::Model),
    Custom(Model),
}
impl RecordV1 {
    pub fn normalize_from(&self) -> RecordItem {
        if self.r#type == TYPE_LOG {
            RecordItem::Log(Log {
                r#type: self.r#type.to_string(),
                uuid: self.uuid.to_string(),
                appid: self.appid.to_string(),
                data: self.data.clone(),
                create_time: DateTime::now(),
                device_time: self.time.clone(),
            })
        } else if self.r#type == TYPE_NETWORK {
            RecordItem::Network(logs_network::Model {
                r#type: self.r#type.to_string(),
                uuid: self.uuid.to_string(),
                appid: self.appid.to_string(),
                data: self.data.clone(),
                create_time: DateTime::now(),
                device_time: self.time.clone(),
            })
        } else if self.r#type == TYPE_ERROR {
            RecordItem::Error(logs_error::Model {
                r#type: self.r#type.to_string(),
                uuid: self.uuid.to_string(),
                appid: self.appid.to_string(),
                data: self.data.clone(),
                create_time: DateTime::now(),
                device_time: self.time.clone(),
            })
        } else {
            RecordItem::Custom(Log {
                r#type: self.r#type.to_string(),
                uuid: self.uuid.to_string(),
                appid: self.appid.to_string(),
                data: self.data.clone(),
                create_time: DateTime::now(),
                device_time: self.time.clone(),
            })
        }
        
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct RecordV2 {
  pub appid: String,
  pub data: Vec<RecordV1>,
}

impl RecordV2 {
    pub fn normalize(&self) -> Vec<RecordItem> {
        let data = &self.data;
        let res = data.into_iter().map(|item| item.normalize_from());
        res.collect()
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Model {
  pub r#type: String,
  pub appid: String,
  pub data: Map<String, Value>,
  pub uuid: String,
  #[serde(serialize_with = "serialize_time")]
  pub create_time: DateTime,
  pub device_time: Option<String>,
}

pub type Log = Model;

impl BaseModel for Model {
    const NAME: &'static str = NAME;
    type Model = Model;
}
impl PaginationModel for Model {}
impl QueryModel for Model {}
impl CreateModel for Model {}
impl DeleteModel for Model {}
impl EditModel for Model {}

impl Model {
    pub async fn find_from_aggregrate<T>(
        db: &Database,
        pipeline: Vec<Document>
    ) -> QueryResult<Vec<T>>
    where
        T: DeserializeOwned
    {
        let mut res = Self::col(db).aggregate(pipeline, None).await?;
        let mut collect_data = vec![];

        while let Some(record) = res.next().await {
            // match
            let record = from_document(record?)?;
            collect_data.push(record);
        }
        Ok(collect_data)
    }
}
