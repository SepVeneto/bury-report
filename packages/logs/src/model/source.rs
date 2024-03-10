use std::str::FromStr;
use mongodb::{bson::{doc, oid}, results::InsertOneResult, Database};
use serde::{Deserialize, Serialize};

use super::QueryResult;

pub const NAME: &str = "source";

#[derive(Deserialize, Serialize, Clone)]
pub struct BasePayload<T> {
    pub id: T,
    pub name: String,
}

pub struct Filter {
    pub name: Option<String>,
}

#[derive(Deserialize, Serialize)]
pub struct Model {
    name: String,
}

impl Model {
    pub async fn find_by_id(db: &Database, id: &str) -> QueryResult<Option<Self>> {
        let oid = oid::ObjectId::from_str(id)?;
        Ok(db.collection::<Self>(NAME).find_one(doc! {"_id": oid }, None).await?)
    }
    pub async fn insert(db: &Database, data: &BasePayload<Option<String>>) -> QueryResult<InsertOneResult> {
        Ok(db.collection(NAME).insert_one(doc! { "name": data.name.clone(), }, None).await?)
    }
    pub async fn find_one(db: &Database, data: Filter) -> QueryResult<Option<Self>> {
        let mut query = doc! {};
        if let Some(name) = data.name {
            query.insert("name", name);
        }

        Ok(db.collection(NAME).find_one(query, None).await?)
    }
}

