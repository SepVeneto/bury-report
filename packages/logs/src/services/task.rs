use std::time::Duration;

use anyhow::{anyhow, Context};
use bson::{doc, Bson, DateTime};
use chrono::{FixedOffset, NaiveDateTime};
use log::{debug, error, info};
use mongodb::{results::UpdateResult, Database};
use serde::{Deserialize, Serialize};
use tokio_cron_scheduler::{JobScheduler, Job};
use reqwest;

use crate::{apis::Query, model::{serialize_time, task::{Model, TaskLog, TaskStatus}, trigger, CreateModel, EditModel, PaginationModel, PaginationResult, QueryModel}};

use super::ServiceResult;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TaskPayload {
    pub name: String,
    pub trigger_id: String,
    pub execute_time: Option<String>,
    pub immediate: Option<bool>
}
pub async fn create(
    db: &Database,
    data: TaskPayload,
) -> ServiceResult<String> {
    info!("execute-time: {:?}", &data.execute_time);
    let new_doc = Model {
        name: data.name,
        trigger_id: data.trigger_id,
        execute_time: data.execute_time,
        job_id: None,
        logs: vec![],
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

pub async fn update(
    db: &Database,
    task_id: &String,
    scheduler: &JobScheduler,
    data: TaskPayload,
) -> ServiceResult<UpdateResult> {
    let trigger = trigger::Model::find_by_id(db, &data.trigger_id).await?;
    if let None = trigger {
        return Err(anyhow!("触发器非法").into());
    }

    stop(db, scheduler, &task_id).await?;
    let webhook = trigger.unwrap().model.webhook;

    let mut job_id = None;
    let mut execute_time = None;
    if let Some(ref time) = data.execute_time {
        execute_time = Some(time.clone());
        let data_clone = data.clone();
        let db_clone = db.clone();
        let task_id_clone = task_id.clone();
        let webhook_clone= webhook.clone();
        job_id = Some(scheduler.add(Job::new_one_shot_async(
            gen_duration(time.clone())?,
            move |_, _| {
                Box::pin({
                    let webhook = webhook_clone.clone();
                    let db = db_clone.clone();
                    let task_id = task_id_clone.clone();
                    async move {
                        let _ = trigger_webhook(&webhook).await;
                        let _ = Model::record_task(&db, &task_id, TaskStatus::Success).await;
                    }
                })
            }).with_context(move || {
                error!("创建定时任务失败：{:?}", &data_clone);
                return "创建定时任务失败"
            })?
        ).await.with_context(|| {
            error!("添加到调度器失败：{:?}", data);
            return "创建定时任务失败"
        })?);
    }

    let new_doc = Model {
        name: data.name,
        trigger_id: data.trigger_id,
        execute_time,
        job_id,
        logs: vec![],
    };

    let res = Model::update_one(db, &task_id, &new_doc).await?;

    Ok(res)
}

pub async fn stop(
    db: &Database,
    scheduler: &JobScheduler,
    task_id: &String,
) -> ServiceResult<()> {
    let task = Model::find_by_id(db, &task_id).await?;
    if let Some(task) = task {
        let job_id = task.model.job_id;
        if let Some(ref job_id) = job_id {
           if let Err(err) = scheduler.remove(job_id).await {
            error!("任务停止失败：{}", err);
            return Err(anyhow!("任务停止失败").into());
           } else {
            Model::record_task(db, task_id, TaskStatus::Abort).await?;
           }
        }
        Ok(())
    } else {
        Err(anyhow!("非法的任务").into())
    }
}

pub async fn issue(
    db: &Database,
    task_id: &String,
) -> ServiceResult<()> {
    debug!("trigger issue?");
    let task = Model::find_by_id(db, &task_id).await?;

    if let Some(task) = task {
        if let Some(trigger) = trigger::Model::find_by_id(db, &task.model.trigger_id).await? {
            trigger_webhook(&trigger.model.webhook).await?;
            Model::record_task(db, task_id, TaskStatus::Success).await?;
            Ok(())
        } else {
            Err(anyhow!("不存在该触发器").into())
        }
    } else {
        Err(anyhow!("非法的任务").into())
    }
}
fn gen_duration(from: String) -> anyhow::Result<Duration> {
    let beijing = FixedOffset::east_opt(8 * 3600).unwrap();
    let chrono_time = DateTime::now().to_chrono().with_timezone(&beijing);

    let execute_time = NaiveDateTime::parse_from_str(&from, "%Y-%m-%d %H:%M:%S").unwrap().and_local_timezone(beijing);

    let offset = execute_time.unwrap().timestamp_millis() - chrono_time.timestamp_millis();
    debug!("offset: {}", offset);
    if offset <= 0 {
        return Err(anyhow!("非法时间").into());
    } else {
        Ok(Duration::from_millis(offset.try_into().unwrap()))
    }

}

async fn trigger_webhook(webhook: &String) -> anyhow::Result<()> {
    info!("webhook: {}", webhook);
    let client = reqwest::Client::new();
    let res = client.post(webhook).send().await;
    if let Err(res) = res {
        return Err(anyhow!(res).into())
    }
    Ok(())
}


#[derive(Deserialize, Serialize, Debug)]
pub struct TaskRecord {
    name: String,
    trigger_id: String,
    // TODO
    execute_time: Option<String>,
    #[serde(serialize_with="serialize_time")]
    create_time: bson::DateTime,
    #[serde(serialize_with="serialize_time")]
    update_time: bson::DateTime,
}
pub async fn list(
    db: &Database,
    data: Query<()>,
) -> ServiceResult<PaginationResult<TaskRecord>> {
    let res = Model::pagination(
        db,
        data.page,
        data.size,
        None
    ).await?;

    Ok(res)
}

pub async fn logs(db: &Database, task_id: &String) -> ServiceResult<Vec<TaskLog>> {
    let res = Model::find_by_id(db, task_id).await?;
    if let Some(res) = res {
        Ok(res.model.logs)
    } else {
        error!("非法的任务: {}",task_id );
        Err(anyhow!("非法的任务").into())
    }
}
