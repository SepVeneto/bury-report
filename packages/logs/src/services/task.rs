use anyhow::anyhow;
use bson::{Bson, DateTime};
use mongodb::Database;
use serde::{Deserialize, Serialize};

use crate::{apis::Query, model::{task::Model, trigger, CreateModel, PaginationModel, PaginationResult, QueryModel}};

use super::ServiceResult;

#[derive(Serialize, Deserialize)]
pub struct TaskPayload {
    pub name: String,
    pub webhook_id: String,
    pub datetime: Option<String>,
    pub immediate: Option<bool>
}
pub async fn create(
    db: &Database,
    data: TaskPayload,
) -> ServiceResult<String> {
    let trigger = trigger::Model::find_by_id(db, &data.webhook_id).await?;
    if let None = trigger {
        return Err(anyhow!("触发器非法").into());
    }
    let new_doc = Model {
        name: data.name,
        webhook: trigger.unwrap().model.webhook,
        corn: "TODO".to_string(),
        create_time: DateTime::now(),
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

pub async fn list(
    db: &Database,
    data: Query<()>,
) -> ServiceResult<PaginationResult<Model>> {
    let res = Model::pagination(
        db,
        data.page,
        data.size,
        None
    ).await?;

    Ok(res)
}

pub async fn execute(
    db: &Database,
    id: String,
) -> ServiceResult<()> {
    let task = Model::find_by_id(db, &id).await?;

    if let None = task {
        return Err(anyhow!("非法的任务").into());
    }

    let res = reqwest::get(task.unwrap().model.webhook).await;
    if let Err(res) = res {
        return Err(anyhow!(res).into())
    }

    Ok(())
}
