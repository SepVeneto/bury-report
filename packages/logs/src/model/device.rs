use bson::DateTime;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use crate::model::serialize_time;

use super::{BaseModel, CreateModel, EditModel, QueryModel};

#[derive(Serialize, Deserialize, Debug)]
pub struct Model {
    pub uuid: String,
    pub data: Map<String, Value>,
    #[serde(serialize_with = "serialize_time")]
    pub last_open: DateTime,
    pub total_open: u32,
}

impl BaseModel for Model {
    const NAME: &'static str = "statistic_device";
    type Model = Model;
}
impl CreateModel for Model {}
impl QueryModel for Model {}
impl EditModel for Model {}
