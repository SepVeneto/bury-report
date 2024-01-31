use mongodb::bson::DateTime;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Deserialize, Serialize)]
pub struct Captcha {
  key: String,
  offset: usize,
  create_time: String,
}

#[derive(Deserialize, Serialize)]
pub struct Log {
  pub r#type: String,
  pub appid: String,
  pub data: Map<String, Value>,
  pub create_time: DateTime,
}

#[derive(Deserialize, Serialize)]
pub struct User {
  pub name: String,
  pub password: String,
}
