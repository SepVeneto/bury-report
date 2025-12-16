use serde::{Deserialize, Serialize};

use crate::model::{BaseModel, QueryModel};

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Model {

}

impl BaseModel for Model {
    const NAME: &'static str = "alert_rule";
    type Model = Model;
}

impl QueryModel for Model {}
