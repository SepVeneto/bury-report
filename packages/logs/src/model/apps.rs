use std::str::FromStr;

use mongodb::{
    bson::{doc, oid::ObjectId},
    options::FindOptions,
    Collection,
    Database,
    Client,
};
use serde::{Deserialize, Serialize};
use futures_util::StreamExt;
use crate::config::serialize_from_oid;

use crate::apis::apps::CreatePayload;

use super::{QueryResult, QueryPayload, PaginationResult, QueryBase};

pub const NAME:&str = "apps";

#[derive(Deserialize, Serialize, Debug)]
pub struct Model {
    #[serde(
        rename(serialize  = "id"),
        serialize_with = "serialize_from_oid",
    )]
    pub _id: ObjectId,
    pub name: String,
    pub is_delete: Option<bool>,
}

impl Model {
    pub fn col(db: &Database) -> Collection<Self> {
        db.collection(NAME)
    }
    pub fn col_with_id(db: &Database) -> Collection<QueryBase<Self>> {
        db.collection(NAME)
    }
    pub async fn unique_check(db: &Database, key: String) -> QueryResult<bool> {
        let res = Self::col(db).find_one(doc! {"name": key}, None).await?;
        if let Some(_) = res {
            Ok(false)
        } else {
            Ok(true)
        }
    }
    pub async fn create(db: &Database, data: &CreatePayload) -> QueryResult<Option<ObjectId>> {
        let new_doc = Self {
            _id: ObjectId::new(),
            name: data.name.clone(),
            is_delete: None,
        };
        let res = Self::col(db)
        .insert_one(new_doc, None)
        .await?;
        let oid = res.inserted_id.as_object_id();
        Ok(oid)
    }
    pub async fn find_all_from_client(client: &Client) -> QueryResult<Vec<Model>> {
        let db = client.database("reporter");
        Ok(Self::find_all(&db).await?)
    }
    pub async fn find_all(db: &Database) -> QueryResult<Vec<Model>> {
        let mut cursor = Self::col(db).find(None, None).await?;
        let mut list = vec![];
        while let Some(record) = cursor.next().await {
            list.push(record?);
        }

        Ok(list)
    }
    pub async fn find_by_id(db: &Database, id: &str) -> QueryResult<Option<Self>> {
        let oid = ObjectId::from_str(id)?;
        let res = Self::col(db).find_one(doc! { "_id": oid }, None).await?;
        Ok(res)
    }

    pub async fn delete_by_id(db: &Database, id: &str) -> QueryResult<()> {
        let oid = ObjectId::from_str(id)?;
        Self::col(db).find_one_and_delete(doc! { "_id": oid }, None).await?;
        Ok(())
    }
    pub async fn pagination(
        db: &Database,
        data: &QueryPayload
    ) -> QueryResult<PaginationResult<Self>> {
        let col = Self::col_with_id(db);
        let start = data.page;
        let size = data.size;

        let options = FindOptions::builder()
            .sort(doc! {"_id": -1})
            .skip((start - 1) * size)
            .limit(size as i64)
            .build();
        let mut res = col.find(doc! {}, options).await?;

        let total = col.count_documents(doc! {}, None).await?;
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

