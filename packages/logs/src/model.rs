use std::str::FromStr;

use anyhow::anyhow;
use mongodb::{
    bson::{self, doc, oid::ObjectId, Document},
    options::FindOptions,
    results::{InsertManyResult, InsertOneResult, UpdateResult},
    Collection,
};
use serde::{Deserialize, Serialize};
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
    #[error(transparent)]
    CommonError(#[from] anyhow::Error)
}

pub trait BaseModel {
    const NAME: &'static str;
    type Model: for<'a> Deserialize<'a> + Serialize + Unpin + Send + Sync;
    fn col(db: &Database, appid: &str) -> Collection<Self::Model> {
        let col_name = format!("{}_{}", appid, Self::NAME);
        db.collection(&col_name)
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
        appid: &str,
        data: &QueryPayload
    ) -> QueryResult<PaginationResult<Self::Model>> {
        let col = Self::col(db, appid);
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
        let mut res = col.find(query.clone(), options).await?;

        let total = col.count_documents(query.clone(), None).await?;
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

pub trait QueryModel: BaseModel {
    async fn find_one(
        db: &Database,
        appid: &str,
        filter: Document,
    ) -> QueryResult<Option<Self::Model>> {
        let col = Self::col(db, appid);
        let res = col.find_one(filter, None).await?;
        Ok(res)
    }

    async fn find_by_id(
        db: &Database,
        appid: &str,
        id: &str,
    ) -> QueryResult<Option<Self::Model>> {
        let oid = ObjectId::from_str(id)?;
        let res = Self::find_one(db, appid, doc! { "_id": oid }).await?;
        Ok(res)
    }

    async fn find_all(
        db: &Database,
        appid: &str,
        filter: impl Into<Option<Document>>,
    ) -> QueryResult<Vec<Self::Model>> {
        let col = Self::col(db, appid);
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
        appid: &str,
        data: Self::Model
    ) -> QueryResult<InsertOneResult> {
        let col = Self::col(db, appid);
        let res = col.insert_one(data, None).await?;
        Ok(res)
    }

    async fn insert_many(
        db: &Database,
        appid: &str,
        data: Vec<Self::Model>
    ) -> QueryResult<InsertManyResult> {
        let col = Self::col(db, appid);
        let res = col.insert_many(data, None).await?;
        Ok(res)
    }
}

pub trait EditModel: BaseModel + QueryModel {
    async fn update_one(
        db: &Database,
        appid: &str,
        id: &str,
        data: &Self::Model,
    ) -> QueryResult<UpdateResult> {
        let col = Self::col(db, appid);
        let oid = ObjectId::from_str(id)?;
        let res = Self::find_by_id(db, appid, id).await?;
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
        appid: &str,
        id: &str,
    ) -> QueryResult<()> {
        let col = Self::col(db, appid);
        let oid = ObjectId::from_str(id)?;
        let res = col.find_one_and_delete(doc! { "_id": oid }, None).await?;
        if let None = res {
            Err(anyhow!("记录不存在").into())
        } else {
            Ok(())
        }
    }
}