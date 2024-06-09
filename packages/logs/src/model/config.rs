use bson::doc;
use serde::{Deserialize, Serialize};
use mongodb::{options::UpdateOptions, Database};

use super::{BaseModel, QueryModel, QueryResult};

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
impl QueryModel for Model {}
impl Model {
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
