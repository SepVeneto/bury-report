use anyhow::anyhow;
use bson::doc;
use mongodb::Database;

use super::ServiceResult;
use crate::model::{
    projects::Model, CreateModel, QueryModel, QueryBase,
};

pub async fn get_projects(db: &Database) -> ServiceResult<Vec<QueryBase<Model>>> {
    Ok(Model::find_all(db, None).await?)
}

pub async fn create_project(db: &Database, data: Model) -> ServiceResult<String> {
    let res = Model::find_one(db, doc! {
        "name": data.name.clone(),
    }).await?;

    if let Some(_) = res {
        Err(anyhow!("project exists in database").into())
    } else {
        let res = Model::insert_one(db, data).await?;
        Ok(res.inserted_id.to_string())
    }
}