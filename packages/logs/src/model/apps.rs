use std::str::FromStr;

use anyhow::anyhow;
use log::info;
use mongodb::{bson::{doc, oid::ObjectId, Document}, Collection, Database};
use serde::{Deserialize, Serialize};
use futures_util::StreamExt;

use crate::apis::apps::CreatePayload;

use super::{BaseModel, PagintionModel, QueryResult};

pub const NAME:&str = "apps";

#[derive(Deserialize, Serialize)]
pub struct Model {
    pub name: String,
    pub is_delete: Option<bool>,
}

impl Model {
    pub fn col(db: &Database) -> Collection<Self> {
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
            name: data.name.clone(),
            is_delete: None,
        };
        let res = Self::col(db)
        .insert_one(new_doc, None)
        .await?;
        let oid = res.inserted_id.as_object_id();
        Ok(oid)
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
}

impl PagintionModel for Model {
    const NAME: &'static str = NAME;
    type Model = Model;
}
