use anyhow::{anyhow, Context};
use futures_util::future::join_all;
use log::info;
use mongodb::{bson::{doc, DateTime}, Database};

use crate::{
    apis::apps::CreatePayload,
    model::{
        apps::Model,
        logs,
        logs_error,
        logs_network,
        DeleteModel,
        PaginationResult,
        QueryPayload
    }
};

use super::{ServiceError, ServiceResult};

pub async fn create_collections(db: &Database, appid: &str) -> ServiceResult<()> {
    let log_col = format!("{}_log", appid);
    let api_col = format!("{}_api", appid);
    let error_col = format!("{}_err", appid);
    db.create_collection(&log_col, None).await
        .with_context(|| format!("创建日志集合失败: {}", log_col))?;
    db.create_collection(&api_col, None).await
        .with_context(|| format!("创建网络集合失败: {}", api_col))?;
    db.create_collection(&error_col, None).await
        .with_context(|| format!("创建错误集合失败: {}", error_col))?;
    Ok(())
}

pub async fn delete_collections(db: &Database, appid: &str) -> ServiceResult<()> {
    let log_col = format!("{}_log", appid);
    let api_col = format!("{}_api", appid);
    let error_col = format!("{}_err", appid);

    db.collection::<Model>(&log_col).drop(None).await
        .with_context(|| format!("删除日志集合失败: {}", log_col))?;
    db.collection::<Model>(&api_col).drop(None).await
        .with_context(|| format!("删除网络集合失败: {}", api_col))?;
    db.collection::<Model>(&error_col).drop(None).await
        .with_context(|| format!("删除错误集合失败: {}", error_col))?;

    Ok(())
}

pub async fn create_app(db: &Database, payload: &CreatePayload) -> ServiceResult<String> {
    let is_unique = Model::unique_check(db, payload.name.to_owned()).await?;
    if is_unique {
        let appid = Model::create(db, payload).await?;
        if let Some(appid) = appid {
            let str = appid.to_string();
            create_collections(db, &str).await?;
            Ok(str)
        } else {
            Err(anyhow!("应用{}创建失败！", payload.name).into())
        }
    } else {
        info!("error");
        Err(ServiceError::Common(anyhow!("应用{}已存在！", payload.name)))
        // Err()
    }
}

pub async fn delete_app(db: &Database, id: &str) -> ServiceResult<()> {
    Model::delete_by_id(db, id).await?;

    delete_collections(db, id).await?;

    Ok(())
}

pub async fn get_list(db: &Database, query: &QueryPayload) -> ServiceResult<PaginationResult<Model>> {
    let res = Model::pagination(db, query).await?;

    Ok(res)
}

async fn get_all(db: &Database) -> ServiceResult<Vec<Model>> {
    let res = Model::find_all(db).await?;

    Ok(res)
}

async fn clear_logs(db: &Database, appid: &str, limit: u32) -> ServiceResult<()> {
    let (_, start_time) = get_recent_days(limit)?;
    logs::Model::delete_many(
        db,
        appid,
        doc! {
            "create_time": {
                "$gte": start_time,
            },
        },
    ).await?;
    Ok(())
}
async fn clear_networks(db: &Database, appid: &str, limit: u32) -> ServiceResult<()> {
    let (_, start_time) = get_recent_days(limit)?;
    logs_network::Model::delete_many(
        db,
        appid,
        doc! {
            "create_time": {
                "$gte": start_time,
            },
        },
    ).await?;
    Ok(())
}
async fn clear_errors(db: &Database, appid: &str, limit: u32) -> ServiceResult<()> {
    let (_, start_time) = get_recent_days(limit)?;
    logs_error::Model::delete_many(
        db,
        appid,
        doc! {
            "create_time": {
                "$gte": start_time,
            },
        },
    ).await?;
    Ok(())
}

fn get_recent_days(num: u32) -> ServiceResult<(DateTime, DateTime)>{
    let now = chrono::Utc::now();
    if let (Some(end_time), Some(start_time)) = (
        now.checked_sub_signed(chrono::Duration::days(1)),
        now.checked_sub_signed(chrono::Duration::days(num as i64)),
    ) {
        Ok((
            DateTime::from_millis(start_time.timestamp_millis()),
            DateTime::from_millis(end_time.timestamp_millis()),
        ))
    } else {
        Err(anyhow!("获取近{}天日期失败", num).into())
    }
}

// pub async fn gc_all(db: &Database) -> ServiceResult<()> {
//     let appids: Vec<String>  = get_all(db)
//         .await?
//         .iter()
//         .map(|item| item._id.to_string())
//         .collect();

//     join_all(appids.iter().map(|appid| async {
//         if let Err(err) = clear_logs(db, appid).await {
//             return Err(err);
//         }
//         if let Err(err) = clear_errors(db, appid).await {
//             return Err(err);
//         }
//         if let Err(err) = clear_networks(db, appid).await {
//             return Err(err);
//         }
//         Ok(())
//     })).await;
//     // appids.map(|appid| async {
//     //     let appid = appid.to_string();

//     // });

//     Ok(())
// }

pub async fn gc_logs(db: &Database, limit: u32) -> ServiceResult<()> {
    let appids: Vec<String>  = get_all(db)
        .await?
        .iter()
        .map(|item| item._id.to_string())
        .collect();

    join_all(appids.iter().map(|appid| async {
        let res = clear_logs(db, appid, limit).await;
        info!("gc {}_logs successfully", appid.clone());
        res
    })).await;

    Ok(())
}
pub async fn gc_networks(db: &Database, limit: u32) -> ServiceResult<()> {
    let appids: Vec<String>  = get_all(db)
        .await?
        .iter()
        .map(|item| item._id.to_string())
        .collect();

    join_all(appids.iter().map(|appid| async {
        let res = clear_networks(db, appid, limit).await;
        info!("gc {}_api successfully", appid.clone());
        res
    })).await;

    Ok(())
}
pub async fn gc_errors(db: &Database, limit: u32) -> ServiceResult<()> {
    let appids: Vec<String>  = get_all(db)
        .await?
        .iter()
        .map(|item| item._id.to_string())
        .collect();

    join_all(appids.iter().map(|appid| async {
        let res = clear_errors(db, appid, limit).await;
        info!("gc {}_err successfully", appid.clone());
        res
    })).await;

    Ok(())
}
