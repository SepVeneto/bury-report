use bson::DateTime;
use serde::{Deserialize, Serialize};

use super::{BaseModel, CreateModel, EditModel, PaginationModel, QueryModel};

#[derive(Serialize, Deserialize, Debug)]
pub struct Model {
    pub name: String,
    pub webhook: String,
    pub corn: String,
    pub create_time: DateTime,
}

impl BaseModel for Model {
    const NAME: &'static str = "app_task";
    type Model = Model;
}
impl QueryModel for Model {}
impl PaginationModel for Model {}
impl CreateModel for Model {}
impl EditModel for Model {}
