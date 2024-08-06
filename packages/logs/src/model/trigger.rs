use serde::{Deserialize, Serialize};
use super::{BaseModel, CreateModel, DeleteModel, EditModel, PaginationModel, QueryModel};

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Model {
    pub name: String,
    pub webhook: String,
}

impl BaseModel for Model {
    const NAME: &'static str = "app_trigger";
    type Model = Model;
}
impl QueryModel for Model {}
impl CreateModel for Model {}
impl EditModel for Model {}
impl PaginationModel for Model {}
impl DeleteModel for Model {}
