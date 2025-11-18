use std::str::FromStr;

use mongodb::{
    bson::{doc, oid::ObjectId},
    Collection,
    Database,
};
use serde::{Deserialize, Serialize};
use crate::config::serialize_from_oid;

use super::QueryResult;

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


    pub async fn find_by_id(db: &Database, id: &str) -> QueryResult<Option<Self>> {
        let oid = ObjectId::from_str(id)?;
        let res = Self::col(db).find_one(doc! { "_id": oid }, None).await?;
        Ok(res)
    }


}

