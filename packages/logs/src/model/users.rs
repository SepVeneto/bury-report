
use actix_web::web;
use mongodb::{bson::doc, results::InsertOneResult, Database};
use serde::{Deserialize, Serialize};
use super::QueryResult;

pub const NAME: &str = "user";

pub struct Filter {
    pub name: Option<String>,
}

#[derive(Deserialize, Serialize)]
pub struct Model {
  pub name: String,
  pub password: String,
}

impl Model {
    pub async fn find_one(db: &web::Data<Database>, filter: Filter) -> QueryResult<Option<Self>> {
        let mut query = doc! {};
        if let Some(name) = filter.name {
            query.insert("name", name);
        }
        Ok(db.collection(NAME).find_one(query, None).await?)
    }
    pub async fn insert_one(db: &web::Data<Database>, data: &Self) -> QueryResult<InsertOneResult> {
        let data = doc! {
            "name": data.name.to_owned(),
            "password": data.password.to_owned(),
        };
        Ok(db.collection(NAME).insert_one(data, None).await?)
    }
}

#[derive(Deserialize, Serialize)]
pub struct LoginPayload {
    pub name: String,
    pub password: String,
    pub key: String,
    pub offset: usize,
}
#[derive(Deserialize, Serialize)]
pub struct RegisterPayload {
    pub name: String,
    pub password: String,
    pub confirm_password: String,
    pub captcha: String,
}
