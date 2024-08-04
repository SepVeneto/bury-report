use std::str::FromStr;
use anyhow::anyhow;
use bson::{doc, Bson, DateTime};
use log::error;
use serde::{Deserialize, Serialize};
use mongodb::{Database, bson::oid::ObjectId};
use uuid::Uuid;

use crate::model::serialize_time;

use super::{BaseModel, CreateModel, EditModel, PaginationModel, QueryModel, QueryResult};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all="lowercase")]
pub enum TaskStatus {
    Success,
    Abort,
    Fail,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TaskLog {
    #[serde(serialize_with = "serialize_time")]
    create_time: DateTime,
    status: TaskStatus,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Model {
    pub name: String,
    pub webhook: String,
    pub execute_time: Option<String>,
    pub job_id: Option<Uuid>,
    pub logs: Vec<TaskLog>,
}



impl Into<Bson> for TaskStatus {
    fn into(self) -> Bson {
        match self {
            TaskStatus::Success => Bson::String("success".to_string()),
            TaskStatus::Abort => Bson::String("abort".to_string()),
            TaskStatus::Fail => Bson::String("fail".to_string()),
        }
    }
}



impl Model {
    pub async fn record_task(db: &Database, task_id: &String, status: TaskStatus) -> QueryResult<()> {
        let col = <Self as EditModel>::col(db);

        let oid = ObjectId::parse_str(task_id)?;
        let _ = col.update_one(doc! { "_id": oid }, doc! {
            "$set": {
                "job_id": Bson::Null,
            },
            "$push": {
                "logs": { "create_time": DateTime::now(), "status": status }
            }
        }, None).await?;

        Ok(())
    }
}

impl BaseModel for Model {
    const NAME: &'static str = "app_task";
    type Model = Model;
}
impl QueryModel for Model {}
impl PaginationModel for Model {}
impl CreateModel for Model {}
impl EditModel for Model {}
