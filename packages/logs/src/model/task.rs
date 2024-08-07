use std::str::FromStr;
use bson::{doc, Bson, DateTime};
use serde::{Deserialize, Serialize};
use mongodb::{Database, bson::oid::ObjectId};
use uuid::Uuid;

use crate::model::serialize_time;

use super::{BaseModel, CreateModel, EditModel, PaginationModel, QueryModel, QueryResult};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all="lowercase")]
pub enum TaskStatus {
    Success,
    Abort,
    Fail,
    Pending,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct TaskLog {
    #[serde(serialize_with = "serialize_time")]
    create_time: DateTime,
    status: TaskStatus,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Model {
    pub name: String,
    pub trigger_id: String,
    pub execute_time: Option<String>,
    pub job_id: Option<Uuid>,
    pub status: TaskStatus,
    pub notify_id: Option<String>,
}

impl Model {
    pub async fn set_job_id(
        db: &Database,
        task_id: &String,
        job_id: &String,
    ) -> QueryResult<()> {
        let oid = ObjectId::from_str(task_id)?;
        <Self as EditModel>::col(db).update_one(
            doc! { "_id": oid},
            doc! {
                "$set": {
                    "job_id": job_id,
                    "update_time": DateTime::now(),
                }
            },
            None
        ).await?;
        Ok(())
    }
    pub async fn set_status(
        db: &Database,
        task_id: &String,
        status: TaskStatus,
    ) -> QueryResult<()> {
        let oid = ObjectId::from_str(task_id)?;
        <Self as EditModel>::col(db).update_one(
            doc! { "_id": oid},
            doc! {
                "$set": {
                    "status": status,
                    "update_time": DateTime::now(),
                }
            },
            None
        ).await?;
        Ok(())
    }
}



impl Into<Bson> for TaskStatus {
    fn into(self) -> Bson {
        match self {
            TaskStatus::Success => Bson::String("success".to_string()),
            TaskStatus::Abort => Bson::String("abort".to_string()),
            TaskStatus::Fail => Bson::String("fail".to_string()),
            TaskStatus::Pending => Bson::String("pending".to_string()),
        }
    }
}

impl TaskStatus {
    pub fn to_string(&self) -> &str {
        match self {
            &TaskStatus::Success => "成功",
            &TaskStatus::Abort => "取消",
            &TaskStatus::Fail => "失败",
            &TaskStatus::Pending => "待执行",
        }
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
