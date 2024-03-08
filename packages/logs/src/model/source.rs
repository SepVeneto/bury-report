use std::{borrow::Borrow, sync::Arc};
use actix_web::web::Json;
use mongodb::{bson::{doc, Document}, Collection, Database};
use serde::{Deserialize, Serialize};

use crate::apis::SourcePayload;

pub const NAME: &str = "source";

#[derive(Deserialize, Serialize)]
pub struct Model {
    name: String,
}

impl Model {
    pub fn from(json: Json<SourcePayload>) -> Self {
        Model {
            name: json.name,
        }
    }
}

pub struct Operation {
    collection: Collection<Document>,
}
impl Operation {
    pub fn new(db: &Arc<Database>) -> Self {
        Self {
            collection: db.collection(NAME),
        }
    }
    pub async fn insert_one(&self, data: impl Borrow<Document>) {
        let res = self.collection.insert_one(data, None).await;
    }
    pub async fn find_one(&self, query: impl Into<Option<Document>>) -> {
        let res = self.collection.find_one(query, None).await;
        match res {
            Ok(res) => {
                res
            },
            Err(err) => {
                return Err(err)
            }
        }
    }
}
