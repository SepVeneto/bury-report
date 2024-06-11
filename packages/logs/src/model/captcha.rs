use mongodb::{bson::doc, results::DeleteResult, Collection, Database};
use serde::{Deserialize, Serialize};
use super::QueryResult;

pub const NAME: &str = "captcha";

pub struct Filter {
    pub key: Option<String>,
}

#[derive(Deserialize, Serialize)]
pub struct Model {
  pub key: String,
  pub offset: usize,
  create_time: String,
}

impl Model {
    pub fn collection(db: &Database) -> Collection<Model> {
        db.collection::<Model>(NAME)
    }

    pub async fn find_one(db: &Database, filter: Filter) -> QueryResult<Option<Self>> {
        let mut query = doc! {};
        if let Some(key) = filter.key {
            query.insert("key", key);
        }

        Ok(Self::collection(db).find_one(query, None).await?)
    }

    pub async fn delete_one(db: &Database, key: &str) -> QueryResult<DeleteResult> {
        Ok(Self::collection(db).delete_one(doc! { "key": key }, None).await?)
    }
}
