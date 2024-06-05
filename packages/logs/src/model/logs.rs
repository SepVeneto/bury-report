use std::fmt::Debug;

use futures_util::StreamExt;
use mongodb::{
    bson::{doc, DateTime, Document, from_document},
    Database,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize, Serializer};
use serde_json::{Map, Value};
use log::error;
use super::{logs_error, logs_network, BaseModel, CreateModel, DeleteModel, PaginationModel, QueryResult};

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
            })
        } else if self.r#type == TYPE_NETWORK {
            RecordItem::Network(logs_network::Model {
                r#type: self.r#type.to_string(),
                uuid: self.uuid.to_string(),
                appid: self.appid.to_string(),
                data: self.data.clone(),
                create_time: DateTime::now(),
            })
        } else if self.r#type == TYPE_ERROR {
            RecordItem::Error(logs_error::Model {
                r#type: self.r#type.to_string(),
                uuid: self.uuid.to_string(),
                appid: self.appid.to_string(),
                data: self.data.clone(),
                create_time: DateTime::now(),
            })
        } else {
            RecordItem::Custom(Log {
                r#type: self.r#type.to_string(),
                uuid: self.uuid.to_string(),
                appid: self.appid.to_string(),
                data: self.data.clone(),
                create_time: DateTime::now(),
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
}
pub fn serialize_time<S>(time: &DateTime, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer
{
    match time.try_to_rfc3339_string() {
        Ok(time_str) => {
            match chrono::DateTime::parse_from_rfc3339(&time_str) {
                Ok(res) => {
                    let fmt_str = res.format("%Y-%m-%d %H:%M:%S");
                    serializer.serialize_str(&format!("{}", fmt_str))
                },
                Err(err) => {
                    error!("{:?}", err);
                    serializer.serialize_none()
                }
            }
        },
        Err(err) => {
            error!("{:?}", err);
            serializer.serialize_none()
        }
    }

}

pub type Log = Model;

impl BaseModel for Model {
    const NAME: &'static str = NAME;
    type Model = Model;
}
impl PaginationModel for Model {}
impl CreateModel for Model {}
impl DeleteModel for Model {}

impl Model {
//     pub fn collection(db: &Database) -> Collection<Log> {
//         db.collection::<Log>(NAME)
//     }
//     pub async fn insert_collects(db: &Database, data: &RecordPayload) -> QueryResult<InsertManyResult>{
//         let records = data.normalize();
//         Ok(Self::collection(db).insert_many(records, None).await?)
//     }
//     pub async fn insert_networks(db: &Database, data: &RecordPayload) -> QueryResult<InsertManyResult>{
//         let records = data.normalize();
//         Ok(Self::collection(db).insert_many(records, None).await?)
//     }
//     pub async fn insert_errors(db: &Database, data: &RecordPayload) -> QueryResult<InsertManyResult>{
//         let records = data.normalize();
//         Ok(Self::collection(db).insert_many(records, None).await?)
//     }
//     pub async fn insert_many(db: &Database, data: &RecordPayload) -> QueryResult<InsertManyResult>{
//         let records = data.normalize();
//         Ok(Self::collection(db).insert_many(records, None).await?)
//     }
    pub async fn find_by_chart<T>(
        db: &Database,
        pipeline: Vec<Document>
    ) -> QueryResult<Vec<T>>
    where
        T: DeserializeOwned
    {
        let mut res = Self::col(db).aggregate(pipeline, None).await?;
        let mut chart_data = vec![];

        while let Some(record) = res.next().await {
            // match
            match from_document(record?) {
                Ok(res) => {
                    chart_data.push(res);
                },
                Err(_) => {}
            };
            // {
            //     Ok(res) => chart_data.push(res),
            //     Err(err) => {
            //         error!("{}", err.to_string());
            //         // Err("Internal error".to_owned())
            //     },
            // };
        }
        Ok(chart_data)
    }

//     pub async fn pagination(
//         db: &Database,
//         appid: &str,
//         data: &QueryPayload
//     ) -> QueryResult<PaginationResult<Model>>{
//         let start = data.page;
//         let size = data.size;

//         let options = FindOptions::builder()
//             .sort(doc! {"_id": -1})
//             .skip((start - 1) * size)
//             .limit(size as i64)
//             .build();
//         let query = doc! {
//             "appid": appid
//         };
//         let mut res = Self::collection(db).find(query.clone(), options).await?;

//         let total = Self::collection(db).count_documents(query.clone(), None).await?;
//         let mut list = vec![];
//         while let Some(record) = res.next().await {
//             list.push(record?);
//         }

//         Ok(PaginationResult {
//             total,
//             list,
//         })
//     }
}
