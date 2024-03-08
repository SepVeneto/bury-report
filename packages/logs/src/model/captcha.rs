use std::sync::Arc;
use mongodb::{Database, Collection};
use serde::{Deserialize, Serialize};

pub const NAME: &str = "captcha";

#[derive(Deserialize, Serialize)]
pub struct Model {
  key: String,
  offset: usize,
  create_time: String,
}

impl Model {
    pub fn collection(db: &Arc<Database>) -> Collection<Model> {
        db.collection::<Model>(NAME)
    }
}
