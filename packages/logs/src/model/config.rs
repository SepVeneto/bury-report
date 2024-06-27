use bson::{doc, Document};
use serde::{Deserialize, Serialize};
use mongodb::{options::UpdateOptions, Database, Collection};

use super::{BaseModel, QueryResult};

pub const NAME: &str = "common_config";

#[derive(Deserialize, Serialize, Debug)]
pub struct Model {
    pub cycle_log: u32,
    pub cycle_api: u32,
    pub cycle_error: u32,
}
impl Default for Model {
    fn default() -> Self {
        Model {
            cycle_api: 3,
            cycle_log: 7,
            cycle_error: 15
        }
    }
}

impl BaseModel for Model {
    const NAME: &'static str = NAME;
    type Model = Model;
}
impl Model {
    fn col(db: &Database) -> Collection<Self> {
        let col_name = Self::NAME;
        db.collection(col_name)
    }
    pub async fn find_one(
        db: &Database,
        filter: Document,
    ) -> QueryResult<Option<Self>> {
        let col = Self::col(db);
        let res = col.find_one(filter, None).await?;
        Ok(res)
    }

    pub async fn update_one(db: &Database, data: Self) -> QueryResult<()> {
        let col = Self::col(db);
        let new_doc = doc! {
            "$set": bson::to_bson(&data)?,
        };
        let options = UpdateOptions::builder().upsert(true).build();
        col.update_one(doc! {}, new_doc, options).await?;
        Ok(())
    }
}
