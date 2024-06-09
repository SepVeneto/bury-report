use bson::doc;
use mongodb::Database;
use crate::model::{config::Model, EditModel, QueryModel};

use super::ServiceResult;

pub async fn get_config(db: &Database) -> ServiceResult<Model> {
    let res = Model::find_one(db, doc! {}).await?;
    Ok(res.unwrap_or_default())
}

pub async fn set_config(db: &Database, data: Model) -> ServiceResult<()> {
    Model::update_one(db, data).await?;
    Ok(())
}