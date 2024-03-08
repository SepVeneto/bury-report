use std::sync::Arc;
use mongodb::{Collection, Database};
use serde::{Deserialize, Serialize};

pub const NAME:&str = "app";

#[derive(Deserialize, Serialize)]
pub struct Model {
    pub name: String,
    pub is_delete: Option<bool>,
}

impl Model {
    pub fn collection(db: &Arc<Database>) -> Collection<Model> {
        db.collection::<Model>(NAME)
    }
}
