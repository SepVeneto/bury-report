use super::{
    serialize_time,
    BaseModel,
    CreateModel,
    PaginationModel
};
use bson::oid::ObjectId;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use mongodb::bson::DateTime;

pub const NAME: &'static str = "records_err";

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct ErrorInfo {
    pub name: String,
    pub message: String,
    pub stack: String,
    pub extra: Option<Value>,
    pub page: Option<Value>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Model {
  pub r#type: String,
  pub appid: String,
  pub data: ErrorInfo,
  pub uuid: String,
  pub session: Option<String>,
  pub stamp: Option<f64>,
  #[serde(serialize_with = "serialize_time")]
  pub create_time: DateTime,
  pub device_time: Option<String>,
  pub normalized_id: Option<ObjectId>,
}

impl BaseModel for Model {
    const NAME: &'static str = NAME;
    type Model = Model;
}
impl CreateModel for Model {}
impl PaginationModel for Model {}
