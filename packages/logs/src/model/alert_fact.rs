use serde::{Deserialize, Serialize};
use bson::DateTime;

use crate::model::{BaseModel, CreateModel, QueryModel};

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Model {
    pub fingerprint: Option<String>,
    pub count: i64,
    pub last_seen: DateTime,
}

impl BaseModel for Model {
    const NAME: &'static str = "alert_fact";
    type Model = Model;
}

impl CreateModel for Model {}
impl QueryModel for Model {}
