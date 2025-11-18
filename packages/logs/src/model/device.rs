use bson::{doc, DateTime};
use mongodb::Database;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use crate::model::serialize_time;

use super::{BaseModel, CreateModel, PaginationModel, QueryBase, QueryModel, QueryResult};

pub type DeviceInfo = Map<String, Value>;
#[derive(Serialize, Deserialize, Debug)]
pub struct Model {
    pub uuid: String,
    pub data: DeviceInfo,
    #[serde(serialize_with = "serialize_time")]
    pub last_open: DateTime,
    pub total_open: u32,
}

impl Model {
    pub async fn find_by_uuid(
        db: &Database,
        id: &str,
    ) -> QueryResult<Option<QueryBase<Self>>> {
        let res = Self::find_one(db, doc! { "uuid": id }).await?;
        Ok(res)
    }
}

impl BaseModel for Model {
    const NAME: &'static str = "statistic_device";
    type Model = Model;
}
impl CreateModel for Model {}
impl QueryModel for Model {}
impl PaginationModel for Model {}
