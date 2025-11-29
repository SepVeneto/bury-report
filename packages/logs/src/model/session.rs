use bson::{doc, DateTime};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use crate::model::serialize_time;

use super::{BaseModel, CreateModel, PaginationModel, QueryModel};

pub type DeviceInfo = Map<String, Value>;
#[derive(Serialize, Deserialize, Debug)]
pub struct Model {
    pub uuid: String,
    pub data: DeviceInfo,
    #[serde(serialize_with = "serialize_time")]
    pub last_open: DateTime,
    pub total_open: u32,
}

impl BaseModel for Model {
    const NAME: &'static str = "records_session";
    type Model = Model;
}
impl CreateModel for Model {}
impl QueryModel for Model {}
impl PaginationModel for Model {}
