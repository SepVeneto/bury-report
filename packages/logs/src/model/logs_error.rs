use super::{
    BaseModel,
    CreateModel,
    DeleteModel,
    serialize_time,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use mongodb::bson::DateTime;

pub const NAME: &'static str = "records_err";

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Model {
  pub r#type: String,
  pub appid: String,
  pub data: Map<String, Value>,
  pub uuid: String,
  #[serde(serialize_with = "serialize_time")]
  pub create_time: DateTime,
}

impl BaseModel for Model {
    const NAME: &'static str = NAME;
    type Model = Model;
}
impl CreateModel for Model {}
impl DeleteModel for Model {}
