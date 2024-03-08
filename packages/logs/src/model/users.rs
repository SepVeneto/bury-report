use std::sync::Arc;

use mongodb::{Collection, Database};
use serde::{Deserialize, Serialize};

pub const NAME: &str = "user";

#[derive(Deserialize, Serialize)]
pub struct Model {
  pub name: String,
  pub password: String,
}

impl Model {
    pub fn collection(db: &Arc<Database>) -> Collection<Self> {
        db.collection(NAME)
    }
}
