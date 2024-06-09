use std::str::FromStr;

use anyhow::anyhow;
use log::info;
use mongodb::{
    bson::{self, doc, oid::ObjectId, Document},
    options::FindOptions,
    results::{InsertManyResult, InsertOneResult, UpdateResult},
    Collection,
};
use serde::{Deserialize, Serialize, Deserializer, Serializer};
use thiserror::Error;
use mongodb::Database;
use futures_util::StreamExt;

pub mod logs;
pub mod captcha;
pub mod users;
pub mod apps;
pub mod source;
pub mod projects;
pub mod charts;
pub mod statistics;
pub mod device;
pub mod logs_network;
pub mod logs_error;
pub mod config;

#[derive(Error, Debug)]
pub enum ModelError {
    #[error("生成oid失败")]
    OidGenError(#[from] bson::oid::Error),
    #[error(transparent)]
    OperateError(#[from] mongodb::error::Error),
    #[error("bson序列化失败")]
    BsonSerError(#[from] mongodb::bson::ser::Error),
    #[error(transparent)]
    BsonDeError(#[from] mongodb::bson::de::Error),
    #[error(transparent)]
    CommonError(#[from] anyhow::Error)
}

pub trait BaseModel {
    const NAME: &'static str;
    type Model: for<'a> Deserialize<'a> + Serialize + Unpin + Send + Sync + std::fmt::Debug;
    fn col(db: &Database) -> Collection<Self::Model> {
        let col_name = Self::NAME;
        db.collection(col_name)
    }
}

pub type QueryResult<T> = anyhow::Result<T, ModelError>;

#[derive(Deserialize, Serialize, Clone)]
pub struct QueryPayload {
    pub page: u64,
    pub size: u64,
    #[serde(skip_deserializing)]
    pub appid: Option<String>,
}
impl QueryPayload {
    pub fn set_appid(&mut self, appid: &str) -> () {
        self.appid = Some(appid.to_string());
    }
}

#[derive(Deserialize, Serialize)]
pub struct PaginationResult<T> {
    pub total: u64,
    pub list: Vec<T>,
}

pub trait PaginationModel: BaseModel {
    async fn pagination(
        db: &Database,
        data: &QueryPayload
    ) -> QueryResult<PaginationResult<Self::Model>> {
        let col = Self::col(db);
        let start = data.page;
        let size = data.size;

        let options = FindOptions::builder()
            .sort(doc! {"_id": -1})
            .skip((start - 1) * size)
            .limit(size as i64)
            .build();
        let query = doc! {};
        let mut res = col.find(query.clone(), options).await?;

        let total = col.count_documents(query.clone(), None).await?;
        let mut list = vec![];
        while let Some(record) = res.next().await {
            info!("record: {:?}", record);
            list.push(record.unwrap())
        }

        Ok(PaginationResult {
            total,
            list,
        })
    }
}

pub trait QueryModel: BaseModel {
    async fn find_one(
        db: &Database,
        filter: Document,
    ) -> QueryResult<Option<Self::Model>> {
        let col = Self::col(db);
        let res = col.find_one(filter, None).await?;
        Ok(res)
    }

    async fn find_by_id(
        db: &Database,
        id: &str,
    ) -> QueryResult<Option<Self::Model>> {
        let oid = ObjectId::from_str(id)?;
        let res = Self::find_one(db, doc! { "_id": oid }).await?;
        Ok(res)
    }

    async fn find_all(
        db: &Database,
        filter: impl Into<Option<Document>>,
    ) -> QueryResult<Vec<Self::Model>> {
        let col = Self::col(db);
        let mut list: Vec<Self::Model> = vec![];
        let mut cursor = col.find(filter, None).await?;
        while let Some(res) = cursor.next().await {
            list.push(res?);
        }

        Ok(list)
    }
}
pub trait CreateModel: BaseModel {
    async fn insert_one(
        db: &Database,
        data: Self::Model
    ) -> QueryResult<InsertOneResult> {
        let col = Self::col(db);
        let res = col.insert_one(data, None).await?;
        Ok(res)
    }

    async fn insert_many(
        db: &Database,
        data: &Vec<Self::Model>
    ) -> QueryResult<InsertManyResult> {
        let col = Self::col(db);
        let res = col.insert_many(data, None).await.unwrap();
        Ok(res)
    }
}

pub trait EditModel: BaseModel + QueryModel {
    async fn update_one(
        db: &Database,
        id: &str,
        data: &Self::Model,
    ) -> QueryResult<UpdateResult> {
        let col = Self::col(db);
        let oid = ObjectId::from_str(id)?;
        let res = Self::find_by_id(db, id).await?;
        if let Some(_) = res {
            let res = bson::to_bson(data)?;
            let new_doc = doc! {
                "$set": res,
            };
            let res = col.update_one(
                doc! {"_id": oid},
                new_doc,
                None
            ).await?;
            Ok(res)
        } else {
            Err(anyhow!("exist").into())
        }
    }
}

pub trait DeleteModel: BaseModel {
    async fn delete_one(
        db: &Database,
        id: &str,
    ) -> QueryResult<()> {
        let col = Self::col(db);
        let oid = ObjectId::from_str(id)?;
        let res = col.find_one_and_delete(doc! { "_id": oid }, None).await?;
        if let None = res {
            Err(anyhow!("记录不存在").into())
        } else {
            Ok(())
        }
    }
    async fn delete_all(
        db: &Database,
    ) -> QueryResult<()> {
        let col = Self::col(db);
        col.drop(None).await?;
        Ok(())
    }
    async fn delete_many(
        db: &Database,
        query: Document,
    ) -> QueryResult<()> {
        let col = Self::col(db);
        let res = col.delete_many(query, None).await?;
        info!("logs delete: {:?}", res);
        Ok(())
    }
}

// pub fn serialize_time<S>(time: &String, serializer: S) -> Result<S::Ok, S::Error>
// where
//     S: Serializer
// {
//     // JSON序列化
//     if serializer.is_human_readable() {
//         serializer.serialize_str(time)
//     } else {
//         // BSON序列化
//         let naive = NaiveDateTime::parse_from_str(time, "%Y-%m-%d %H:%M:%S").unwrap();
//         let chrono_datetime = DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc);
//         let s = mongodb::bson::DateTime::from_chrono(chrono_datetime);
//         s.serialize(serializer)
//     }
// }

pub fn serialize_time<S>(time: &bson::DateTime, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer
{
    // JSON序列化
    if serializer.is_human_readable() {
        let chrono_time = time.to_chrono();
        serializer.serialize_str(&chrono_time.format("%Y-%m-%d %H:%M:%S").to_string())
    } else {
        time.serialize(serializer)
        // BSON序列化
        // let naive = NaiveDateTime::parse_from_str(time, "%Y-%m-%d %H:%M:%S").unwrap();
        // let chrono_datetime = DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc);
        // let s = mongodb::bson::DateTime::from_chrono(chrono_datetime);
        // s.serialize(serializer)
    }
}

pub fn _deserialize_time<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>
{
    let bson_datetime = mongodb::bson::DateTime::deserialize(deserializer)?;
    let res = bson_datetime.to_chrono().format("%Y-%m-%d %H:%M:%S").to_string();
    Ok(res)
}