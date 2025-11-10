use super::{
    serialize_time,
    BaseModel,
    QueryModel,
    CreateModel,
    DeleteModel,
    PaginationModel,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use mongodb::bson::DateTime;

pub const NAME: &'static str = "records_track";

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Model {
  pub r#type: String,
  pub appid: String,
  pub data: Map<String, Value>,
  pub uuid: String,
  pub session: Option<String>,
  #[serde(serialize_with = "serialize_time")]
  pub create_time: DateTime,
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
