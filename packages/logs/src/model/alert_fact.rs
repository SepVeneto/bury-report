use serde::{Deserialize, Serialize};
use bson::DateTime;

use crate::model::{BaseModel, CreateModel, QueryModel, alert_rule::AlertStrategy};

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Model {
    pub fingerprint: Option<String>,
    pub count: i64,
    pub last_seen: DateTime,
    pub ttl: Option<i64>,
    pub strategy: AlertStrategy,
    pub last_notify: Option<DateTime>,
    #[serde(skip)]
    pub flush_count: i64,
    #[serde(skip)]
    pub need_update: bool,
}

impl BaseModel for Model {
    const NAME: &'static str = "alert_fact";
    type Model = Model;
}

impl CreateModel for Model {}
impl QueryModel for Model {}
