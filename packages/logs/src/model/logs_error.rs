use super::{
    serialize_time,
    BaseModel,
    CreateModel,
    PaginationModel
};
use bson::oid::ObjectId;
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
  pub session: Option<String>,
  pub stamp: Option<f64>,
  #[serde(serialize_with = "serialize_time")]
  pub create_time: DateTime,
  pub device_time: Option<String>,
  pub normalized_id: Option<ObjectId>,
  pub fingerprint: String,

  #[serde(skip)]
  pub summary: String,
}

impl BaseModel for Model {
    const NAME: &'static str = NAME;
    type Model = Model;
}
impl CreateModel for Model {}
impl PaginationModel for Model {}
