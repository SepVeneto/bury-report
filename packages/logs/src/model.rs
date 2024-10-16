use std::{str::FromStr, time::SystemTime};

use anyhow::{anyhow, Error};
use bson::{oid, DateTime};
use chrono::FixedOffset;
use log::{debug, error, info};
use mongodb::{
    bson::{self, doc, oid::ObjectId, Document},
    options::FindOptions,
    results::{InsertManyResult, InsertOneResult, UpdateResult},
    Collection,
};
use serde::{de::Visitor, Deserialize, Deserializer, Serialize, Serializer};
use thiserror::Error;
use mongodb::Database;
use futures_util::{join, StreamExt};

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
pub mod trigger;
pub mod task;

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
}

pub type QueryResult<T> = anyhow::Result<T, ModelError>;

#[derive(Deserialize, Serialize, Clone)]
pub struct QueryPayload {
    pub page: u64,
    pub size: u64,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct QueryBase<T> {
    #[serde(rename(serialize = "id"), serialize_with = "bson::serde_helpers::serialize_object_id_as_hex_string")]
    pub _id: oid::ObjectId,
    #[serde(flatten)]
    pub model: T,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct PaginationResult<T> {
    pub total: u64,
    pub list: Vec<QueryBase<T>>,
}

pub struct PaginationOptions {
    query: Option<Document>,
    projection: Option<Document>,
    sort: Option<Document>,
}
impl PaginationOptions {
    pub fn new() -> Self {
        Self {
            query: doc! {}.into(),
            projection: None,
            sort: doc! {"_id": -1}.into(),
        }
    }
    pub fn query(mut self, query: Document) -> Self {
        self.query = Some(query);
        self
    }
    pub fn projection(mut self, projection: Document) -> Self {
        self.projection = Some(projection);
        self
    }
    pub fn sort(mut self, sort: Document) -> Self {
        self.sort = Some(sort);
        self
    }
    pub fn build(self) -> Option<Self> {
        Some(self)
    }
}
impl Default for PaginationOptions {
    fn default() -> Self {
        Self::new()
    }
}

pub trait PaginationModel: BaseModel {
    fn col<T>(db: &Database) -> Collection<QueryBase<T>> {
        let col_name = Self::NAME;
        db.collection(col_name)
    }
    async fn pagination<T>(
        db: &Database,
        page: u64,
        size: u64,
        options: Option<PaginationOptions>,
    ) -> QueryResult<PaginationResult<T>>
    where T: for<'a> Deserialize<'a>
    {
        let col = Self::col(db);
        let start = page;
        let PaginationOptions {
            query,
            projection,
            sort,
        } = options.unwrap_or_default();

        let get_total = async {
            let start_count = SystemTime::now();

            let total;
            if let Some(ref query) = query {
                if query.len() > 0 {
                    total = col.count_documents(query.clone(), None).await?;
                } else {
                    total = col.estimated_document_count(None).await?;
                }
            } else {
                total = col.estimated_document_count(None).await?;
            }
            debug!("count total used: {:?}", SystemTime::now().duration_since(start_count));

            Ok::<u64, Error>(total)
        };
        let get_list = async {
            let start_list= SystemTime::now();

            let options = FindOptions::builder()
                .sort(sort)
                .projection(projection)
                .skip((start - 1) * size)
                .limit(size as i64)
                .build();
            let mut res = col.find(query.clone(), options).await?;

            let mut list = vec![];
            while let Some(record) = res.next().await {
                list.push(record.unwrap())
            }

            debug!("count list used: {:?}", SystemTime::now().duration_since(start_list));
            Ok::<Vec<QueryBase<T>>, Error>(list)
        };
        let (_total, _list) = join!(get_total, get_list);
        let total = _total?;
        let list = _list?;

        Ok(PaginationResult {
            total,
            list,
        })
    }
}

pub trait QueryModel: BaseModel {
    fn col(db: &Database) -> Collection<QueryBase<Self::Model>> {
        let col_name = Self::NAME;
        db.collection(col_name)
    }
    async fn find_one(
        db: &Database,
        filter: Document,
    ) -> QueryResult<Option<QueryBase<Self::Model>>> {
        let col = Self::col(db);
        let res = col.find_one(filter, None).await?;
        Ok(res)
    }

    async fn find_by_id(
        db: &Database,
        id: &str,
    ) -> QueryResult<Option<QueryBase<Self::Model>>> {
        let oid = ObjectId::from_str(id)?;
        let res = Self::find_one(db, doc! { "_id": oid }).await?;
        Ok(res)
    }

    async fn find_all(
        db: &Database,
        filter: impl Into<Option<Document>>,
    ) -> QueryResult<Vec<QueryBase<Self::Model>>> {
        let col = Self::col(db);
        let mut list: Vec<QueryBase<Self::Model>> = vec![];
        let mut cursor = col.find(filter, None).await?;
        while let Some(res) = cursor.next().await {
            list.push(res?);
        }

        Ok(list)
    }
}
pub trait CreateModel: BaseModel
{
    fn col(db: &Database) -> Collection<Document> {
        let col_name = Self::NAME;
        db.collection(col_name)
    }
    async fn insert_one(
        db: &Database,
        data: Self::Model
    ) -> QueryResult<InsertOneResult> {
        let col = Self::col(db);
        let new_doc = bson::to_document(&data);
        match new_doc {
            Ok(mut doc) => {
                let now = DateTime::now();
                doc.insert("create_time", now);
                doc.insert("update_time", now);
                let res = col.insert_one(doc, None).await?;
                Ok(res)
            },
            Err(err) => {
                Err(anyhow!(err).into())
            }
        }
    }

    async fn insert_many(
        db: &Database,
        data: &Vec<Self::Model>
    ) -> QueryResult<InsertManyResult> {
        let col = Self::col(db);
        let mut list = vec![];
        for item in data.iter() {
            let new_doc = bson::to_document(item);
            match new_doc {
                Ok(mut doc) => {
                    let now = DateTime::now();
                    doc.insert("create_time", now);
                    doc.insert("update_time", now);
                    list.push(doc);
                },
                Err(err) => {
                    return Err(anyhow!(err).into());
                }
            }           
        }
        let res = col.insert_many(list, None).await.unwrap();
        Ok(res)
    }
}

pub trait EditModel: BaseModel + QueryModel {
    fn col(db: &Database) -> Collection<Document> {
        let col_name = Self::NAME;
        db.collection(col_name)
    }
    async fn update_one(
        db: &Database,
        id: &str,
        data: &Self::Model,
    ) -> QueryResult<UpdateResult> {
        let col = <Self as EditModel>::col(db);
        let oid = ObjectId::from_str(id)?;
        let res = Self::find_by_id(db, id).await?;
        if let Some(_) = res {
            let mut res = bson::to_document(data)?;
            res.insert("update_time", DateTime::now());
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
    fn col(db: &Database) -> Collection<Self::Model> {
        let col_name = Self::NAME;
        db.collection(col_name)
    }
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
        let beijing = FixedOffset::east_opt(8 * 3600);
        if let Some(offset) = beijing {
            let beijing_time = chrono_time.with_timezone(&offset);
            serializer.serialize_str(&beijing_time.format("%Y-%m-%d %H:%M:%S").to_string())
        } else {
            error!("serialize failed: {:?}", chrono_time);
            serializer.serialize_str("Invalid time")
        }
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

struct StrVisitor;
impl<'de> serde::de::Visitor<'de> for StrVisitor {
    type Value = Option<String>;

    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
        formatter.write_str("str")
    }

    fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        if v.is_empty() {
            Ok(None)
        } else {
            Ok(Some(v.to_string()))
        }
    }
}

struct I32Visitor;
impl <'de> Visitor<'de> for I32Visitor {
    type Value = Option<i32>;

    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
        formatter.write_str("i32")
    }

    fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
        where
            E: serde::de::Error, {
        match v.parse::<i32>() {
            Ok(res) => {
                Ok(Some(res))
            },
            Err(_) => {
                error!("cannot parse string to i32: {}", v);
                Ok(None)
            }
        }
    }
}

pub fn ignore_empty_string<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where 
    D: Deserializer<'de>,
{
    deserializer.deserialize_str(StrVisitor)
}

pub fn convert_to_i32<'de, D>(deserializer: D) -> Result<Option<i32>, D::Error>
where
    D: Deserializer<'de>,
{
    deserializer.deserialize_str(I32Visitor)
}
