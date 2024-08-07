use std::time::Duration;

use anyhow::{anyhow, Context};
use bson::{doc, Bson, DateTime};
use chrono::{FixedOffset, NaiveDateTime};
use log::{debug, error, info};
use mongodb::{results::UpdateResult, Database};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio_cron_scheduler::{JobScheduler, Job};
use reqwest;
use uuid::Uuid;

use crate::{apis::Query, model::{serialize_time, task::{Model, TaskStatus}, trigger, CreateModel, EditModel, PaginationModel, PaginationOptions, PaginationResult, QueryModel}};

use super::ServiceResult;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TaskPayload {
    pub name: String,
    pub trigger_id: String,
    pub execute_time: Option<String>,
    pub immediate: Option<bool>,
    pub notify_id: Option<String>,
}
pub async fn create(
    scheduler: &JobScheduler,
    db: &Database,
    data: TaskPayload,
) -> ServiceResult<String> {
    let trigger = trigger::Model::find_by_id(db, &data.trigger_id).await?;
    if let None = trigger {
        return Err(anyhow!("不存在该触发器").into());
    }

    let mut notify = None;
    if let Some(ref nid) = data.notify_id {
        notify = trigger::Model::find_by_id(db, nid).await?.and_then(|res| {
            Some(res.model.webhook)
        });
        if let None = notify {
            return Err(anyhow!("不存在该通知触发器").into());
        }
    }

    let new_doc = Model {
        name: data.name,
        trigger_id: data.trigger_id,
        execute_time: data.execute_time.clone(),
        job_id: None,
        status: TaskStatus::Pending,
        notify_id: data.notify_id,
    };
    let res = Model::insert_one(db, new_doc.clone()).await?;
    let oid = match res.inserted_id {
        Bson::ObjectId(oid) => oid.to_string(),
        _ => {
            return Err(anyhow!("Fail to get inserted id").into());
        }
    };

    if let Some(true) = data.immediate {
        let _ = issue(db, &oid).await?;
    } else if let Some(_) = data.execute_time {
        let job_id = create_job(
            scheduler,
            db.clone(),
            oid.clone(),
            trigger.unwrap().model.webhook,
            notify.clone(),
            new_doc.clone(),
        ).await?;
        Model::set_job_id(db, &oid, &job_id.to_string()).await?;
    }


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

    let mut notify = None;
    if let Some(ref nid) = data.notify_id {
        notify = trigger::Model::find_by_id(db, nid).await?.and_then(|res| {
            Some(res.model.webhook)
        });
        if let None = notify {
            return Err(anyhow!("通知触发器非法").into());
        }
    }

    stop(db, scheduler, &task_id).await?;
    let webhook = trigger.unwrap().model.webhook;

    let error_data = data.clone();
    let new_doc = Model {
        name: data.name,
        trigger_id: data.trigger_id,
        execute_time: data.execute_time.clone(),
        job_id: None,
        status: TaskStatus::Pending,
        notify_id: data.notify_id,
    };

    if let Some(_) = data.execute_time {
        match create_job(
            scheduler,
            db.clone(),
            task_id.clone(),
            webhook.clone(),
            notify.clone(),
            new_doc.clone(),
        ).await {
            Ok(job) => {
                Model::set_job_id(db, task_id, &job.to_string()).await?;
            },
            Err(err) => {
                error!("{}: {:?}", err, error_data);
                return Err(anyhow!("{}", err).into());
            }
        }
    }



    let res = Model::update_one(db, &task_id, &new_doc).await?;

    Ok(res)
}

async fn create_job(
    scheduler: &JobScheduler,
    db: Database,
    task_id: String,
    webhook: String,
    notify: Option<String>,
    task: Model,
) -> anyhow::Result<Uuid> {
    if let None = task.execute_time {
        return Err(anyhow!("无法创建定时任务").into());
    }
    let trigger_task = task.clone();
    let job_id = scheduler.add(Job::new_one_shot_async(
        gen_duration(task.execute_time.unwrap().to_string())?,
        move |_, _| {
            Box::pin({
                let webhook = webhook.clone();
                let db = db.clone();
                let task_id = task_id.clone();
                let task_clone = trigger_task.clone();
                let notify_clone = notify.clone();
                async move {
                    match trigger_webhook(&webhook, &task_clone).await {
                        Ok(_) => {
                            let _ = Model::set_status(&db, &task_id, TaskStatus::Success).await;
                            let _ = trigger_notify(notify_clone.clone(), &task_clone, TaskStatus::Success).await;
                        },
                        Err(err) => {
                            error!("{}", err);
                            let _ = Model::set_status(&db, &task_id, TaskStatus::Fail).await;
                            let _ = trigger_notify(notify_clone.clone(), &task_clone, TaskStatus::Fail).await;
                        }
                    }
                }
            })
        }).with_context(move || {
            return "创建定时任务失败"
        })?
    ).await.with_context(|| {
        return "创建定时任务失败"
    })?;

    Ok(job_id)
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
                Model::set_status(db, task_id, TaskStatus::Abort).await?;
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

    if let None = task {
        return Err(anyhow!("非法的任务").into());
    }
    let mut notify = None;
    let task_unwrap = task.unwrap();
    if let Some(ref id) = task_unwrap.model.notify_id {
        notify = trigger::Model::find_by_id(db, id).await?.and_then(|res| {
            Some(res.model.webhook)
        });
    }
    if let Some(trigger) = trigger::Model::find_by_id(db, &task_unwrap.model.trigger_id).await? {
        match trigger_webhook(&trigger.model.webhook, &task_unwrap.model).await {
            Ok(_) => {
                Model::set_status(db, task_id, TaskStatus::Success).await?;
                info!("notify: {:?}", &notify);
                let _ = trigger_notify(notify.clone(), &task_unwrap.model, TaskStatus::Success).await;
            },
            Err(err) => {
                error!("{}", err);
                Model::set_status(db, task_id, TaskStatus::Fail).await?;
                let _ = trigger_notify(notify.clone(), &task_unwrap.model, TaskStatus::Fail).await;
            }
        }
        Ok(())
    } else {
        Err(anyhow!("不存在该触发器").into())
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

async fn trigger_webhook(
    webhook: &String,
    task: &Model,
) -> anyhow::Result<()> {
    let data = json!({
        "msgtype": "text",
        "text": {
            "content": task.name,
        }
    });

    let client = reqwest::Client::new();

    let res = client
        .post(webhook)
        .json(&data)
        .send().await;
    if let Err(res) = res {
        return Err(anyhow!(res).into())
    }
    Ok(())
}

async fn trigger_notify(
    webhook: impl Into<Option<String>>,
    task: &Model,
    status: TaskStatus,
) -> anyhow::Result<()> {
    let webhook: Option<String> = webhook.into();
    if let None = webhook {
        return Ok(());
    }

    let data = json!({
        "msgtype": "markdown",
        "markdown": {
            "content": format!(
                "<font color=\"info\">**任务下发通知**</font>\n**名称**：{}\n**下发结果**：{}{}",
                task.name,
                match status {
                    TaskStatus::Fail => "❌",
                    TaskStatus::Success => "✅",
                    _ => "",
                },
                status.to_string(),
            ),
        }
    });

    let client = reqwest::Client::new();

    let res = client
        .post(webhook.unwrap())
        .json(&data)
        .send().await;
    match res {
        Ok(res) => {
            debug!("notify response: {:?}", res);
        },
        Err(err) => {
            return Err(anyhow!(err).into())
        }
    }
    Ok(())
}


#[derive(Deserialize, Serialize, Debug)]
pub struct TaskRecord {
    name: String,
    trigger_id: String,
    notify_id: Option<String>,
    status: String,
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
    let options = PaginationOptions::new().sort(doc! {"update_time": -1}).build();
    let res = Model::pagination(
        db,
        data.page,
        data.size,
        options,
    ).await?;

    Ok(res)
}
