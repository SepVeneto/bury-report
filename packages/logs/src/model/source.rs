use std::str::FromStr;
use mongodb::{bson::{doc, oid}, options::FindOneOptions, results::{DeleteResult, InsertOneResult, UpdateResult}, Collection, Database};
use serde::{Deserialize, Serialize};
use crate::config::serialize_oid;

use super::QueryResult;

pub const NAME: &str = "source";

#[derive(Deserialize, Serialize, Clone)]
pub struct BasePayload {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<oid::ObjectId>,
    pub name: String,
}

pub struct Filter {
    pub name: Option<String>,
}

#[derive(Deserialize, Serialize)]
pub struct Model {
    name: String,
    #[serde(
        rename = "id",
        serialize_with = "serialize_oid",
        skip_serializing_if = "Option::is_none"
    )]
    _id: Option<oid::ObjectId>,
}

impl Model {
    pub fn col (db: &Database) -> Collection<Self> {
        db.collection(NAME)
    }
    pub async fn find_by_id(db: &Database, id: &str) -> QueryResult<Option<Self>> {
        let oid = oid::ObjectId::from_str(id)?;
        let options = FindOneOptions::builder()
            .projection(Some(doc! { "id": "$_id", "name": 1 }))
            .build();
        Ok(Self::col(db).find_one(doc! {"_id": oid }, options).await?)
    }
    pub async fn insert(db: &Database, data: &BasePayload) -> QueryResult<InsertOneResult> {
        let new_doc = Model {
            _id: None,
            name: data.name.to_string(),
        };
        Ok(Self::col(db).insert_one(new_doc, None).await?)
    }
    pub async fn find_one(db: &Database, data: Filter) -> QueryResult<Option<Self>> {
        let mut query = doc! {};
        if let Some(name) = data.name {
            query.insert("name", name);
        }

        Ok(Self::col(db).find_one(query, None).await?)
    }
    pub async fn delete_one(db: &Database, id: &str) -> QueryResult<DeleteResult> {
        let oid = oid::ObjectId::parse_str(id)?;
        Ok(Self::col(db).delete_one(doc! { "_id": oid }, None).await?)
    }
    pub async fn update_one(db: &Database, id: &oid::ObjectId, data: &BasePayload) -> QueryResult<UpdateResult> {
        let filter = doc! { "_id": id };
        let new_doc = doc! {
            "$set": {
                "name": data.name.to_string(),
            }
        };
        let res = Self::col(db)
            .update_one(filter, new_doc, None)
            .await?;
        Ok(res)
    }
}

