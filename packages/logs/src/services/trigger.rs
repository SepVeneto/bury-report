use anyhow::anyhow;
use bson::{doc, Bson};
use mongodb::results::UpdateResult;
use serde::{Deserialize, Serialize};

use crate::{
    apis::{apps::TaskTrigger, Query},
    model::{trigger::Model, CreateModel, DeleteModel, EditModel, PaginationModel, PaginationOptions, PaginationResult, QueryBase, QueryModel}
};

use super::ServiceResult;

pub async fn create(db: &mongodb::Database, data: TaskTrigger) -> ServiceResult<String> {
    let new_doc = Model {
        name: data.name,
        webhook: data.webhook,
    };
    let res = Model::insert_one(db, new_doc).await?;
    let oid = match res.inserted_id {
        Bson::ObjectId(oid) => oid.to_string(),
        _ => {
            return Err(anyhow!("Fail to get inserted id").into());
        }
    };
    Ok(oid)
}

pub async fn update(db: &mongodb::Database, id: &String, data: TaskTrigger) -> ServiceResult<UpdateResult> {
    let trigger = Model::find_by_id(db, id).await?;
    if let None = trigger {
        return Err(anyhow!("找不到对应的数据源").into());
    }

    let new_doc = Model {
        name: data.name,
        webhook: data.webhook,
    };
    let res = Model::update_one(db, id, &new_doc).await?;
    Ok(res)
}

#[derive(Serialize, Deserialize)]
pub struct TriggerFilter {
    name: Option<String>,
    webhook: Option<String>,
}
pub async fn list(
    db: &mongodb::Database,
    data: Query<TriggerFilter>
) -> ServiceResult<PaginationResult<Model>> {
    let mut doc = doc! {};

    if let Some(name) = data.query.name {
        doc.insert("name", name);
    }
    if let Some(webhook) = data.query.webhook {
        doc.insert("webhook", webhook);
    }

    let res = Model::pagination(
        db,
        data.page,
        data.size,
        PaginationOptions::new().query(doc).build(),
    ).await?;
    Ok(res)
}

pub async fn delete(
    db: &mongodb::Database,
    id: &String,
) -> ServiceResult<()> {
    Model::delete_one(db, id).await?;
    Ok(())
}

pub async fn options(db: &mongodb::Database) -> ServiceResult<Vec<QueryBase<Model>>> {
    let res = Model::find_all(db, None).await?;
    Ok(res)
}
