use mongodb::{bson::{doc, oid::ObjectId}, Collection, Database};
use serde::{Deserialize, Serialize};

use super::QueryResult;

pub const NAME:&str = "apps";

#[derive(Deserialize, Serialize)]
pub struct Model {
    pub name: String,
    pub is_delete: Option<bool>,
}

impl Model {
    pub fn collection(db: &Database) -> Collection<Model> {
        db.collection::<Model>(NAME)
    }
    pub async fn find_by_id(db: &Database, id: &str) -> QueryResult<Option<Self>> {
        let oid = ObjectId::parse_str(id)?;
        Ok(Self::collection(db).find_one(doc! { "_id": oid }, None).await?)
    }
}
