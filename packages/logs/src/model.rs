use mongodb::bson::DateTime;
use serde::{Deserialize, Serialize};
#[warn(non_snake_case)]

#[derive(Deserialize, Serialize)]
pub struct Captcha {
  key: String,
  offset: usize,
  createTime: String,
}

#[derive(Deserialize, Serialize)]
pub struct Log {
  pub r#type: String,
  pub appid: String,
  pub createTime: DateTime,
}

#[derive(Deserialize, Serialize)]
pub struct User {
  pub name: String,
  pub password: String,
}
