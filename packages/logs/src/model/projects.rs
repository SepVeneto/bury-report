use serde::{Deserialize, Serialize};

use super::{BaseModel, CreateModel, EditModel, QueryModel};

pub const NAME: &str = "projects";

#[derive(Deserialize, Serialize, Debug)]
pub struct Model {
    pub name: String,
}

impl BaseModel for Model {
    const NAME: &'static str = NAME;
    type Model = Model;
}
impl QueryModel for Model {}
impl CreateModel for Model {}
impl EditModel for Model {}
