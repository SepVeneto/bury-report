use super::{
    serialize_time, BaseModel, CreateModel, DeleteModel, PaginationModel, QueryModel
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub const NAME: &'static str = "records_api";

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Model {
  pub r#type: String,
  pub appid: String,
  pub data: Map<String, Value>,
  pub uuid: String,
  #[serde(serialize_with = "serialize_time")]
  pub create_time: bson::DateTime,
  pub device_time: Option<String>,
}

impl BaseModel for Model {
    const NAME: &'static str = NAME;
    type Model = Model;
}
impl QueryModel for Model {}
impl CreateModel for Model {}
impl DeleteModel for Model {}
impl PaginationModel for Model {}
