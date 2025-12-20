use bson::DateTime;
use md5;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::model::{BaseModel, CreateModel};

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Model {
    pub fingerprint: String,
    pub summary: String,
    pub name: String,
    pub message: String,
    pub page: Option<Value>,
    pub first_seen: DateTime,
    pub last_seen: DateTime,
    pub count: i64,
}

impl BaseModel for Model {
    const NAME: &'static str = "history_error";
    type Model = Model;
}
impl CreateModel for Model {}

fn cal_md5(res: &str) -> String {
  let digest = md5::compute(res.as_bytes());

  format!("{:x}", digest).to_uppercase()
}
