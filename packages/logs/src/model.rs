use mongodb::{bson::{self, doc, Document}, options::FindOptions, Collection, Cursor};
use serde::{Deserialize, Serialize};
use source::Model;
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

#[derive(Error, Debug)]
pub enum ModelError {
    #[error("生成oid失败")]
    OidGenError(#[from] bson::oid::Error),
    #[error("数据库操作失败")]
    OperateError(#[from] mongodb::error::Error),
    #[error("bson序列化失败")]
    BsonSerError(#[from] mongodb::bson::ser::Error),
}


pub type QueryResult<T> = anyhow::Result<T, ModelError>;

#[derive(Deserialize, Serialize, Clone)]
pub struct QueryPayload {
    pub page: u64,
    pub size: u64,
    #[serde(skip_deserializing)]
    pub appid: String,
}
impl QueryPayload {
    pub fn set_appid(&mut self, appid: &str) -> () {
        self.appid = appid.to_string();
    }
}

#[derive(Deserialize, Serialize)]
pub struct PaginationResult<T> {
    pub total: u64,
    pub list: Vec<T>,
}

pub trait PagintionModel {
    const NAME: &'static str;
    type Model: for<'a> Deserialize<'a>;
    fn col (db: &Database) -> Collection<Self::Model> {
        db.collection(Self::NAME)
    }

    async fn pagination(db: &Database, data: &QueryPayload) -> QueryResult<PaginationResult<Self::Model>>{
        let start = data.page;
        let size = data.size;

        let options = FindOptions::builder()
            .sort(doc! {"_id": -1})
            .skip((start - 1) * size)
            .limit(size as i64)
            .build();
        let query = doc! {
            "appid": &data.appid
        };
        let mut res = Self::col(db).find(query.clone(), options).await?;

        let total = Self::col(db).count_documents(query.clone(), None).await?;
        let mut list = vec![];
        while let Some(record) = res.next().await {
            list.push(record?)
        }

        Ok(PaginationResult {
            total,
            list,
        })
    }
}
