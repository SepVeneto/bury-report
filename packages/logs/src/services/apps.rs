use anyhow::{anyhow, Context};
use futures_util::future::join_all;
use log::{info, error};
use mongodb::{bson::{doc, DateTime}, Database, Client};

use crate::{
    apis::apps::CreatePayload, db, model::{
        apps::Model, logs, logs_error, logs_network, BaseModel, DeleteModel, PaginationResult, QueryPayload
    }
};

use super::{ServiceError, ServiceResult};

pub const LOG_COL: &'static str = crate::model::logs::NAME;
pub const API_COL: &'static str = crate::model::logs_network::NAME;
pub const ERROR_COL: &'static str = crate::model::logs_error::NAME;

pub async fn create_collections(client: &Client, appid: &str) -> ServiceResult<()> {
    let db = db::DbApp::create_by_appid(client, appid);
    db.create_collection(&LOG_COL, None).await
        .with_context(|| format!("创建日志集合失败: {}", LOG_COL))?;
    db.create_collection(&API_COL, None).await
        .with_context(|| format!("创建网络集合失败: {}", API_COL))?;
    db.create_collection(&ERROR_COL, None).await
        .with_context(|| format!("创建错误集合失败: {}", ERROR_COL))?;
    Ok(())
}

pub async fn create_app(
    client: &Client,
    db: &Database,
    payload: &CreatePayload
) -> ServiceResult<String> {
    let is_unique = Model::unique_check(db, payload.name.to_owned()).await?;
    if is_unique {
        let appid = Model::create(db, payload).await?;
        if let Some(appid) = appid {
            let str = appid.to_string();
            create_collections(client, &str).await?;
            Ok(str)
        } else {
            Err(anyhow!("应用{}创建失败！", payload.name).into())
        }
    } else {
        Err(ServiceError::Common(anyhow!("应用{}已存在！", payload.name)))
        // Err()
    }
}

pub async fn delete_app(client: &Client, db: &Database, id: &str) -> ServiceResult<()> {
    Model::delete_by_id(db, id).await?;
    let db_name = db::DbApp::get_db_name(id);
    client.database(&db_name).drop(None).await?;
    Ok(())
}

pub async fn get_list(db: &Database, query: &QueryPayload) -> ServiceResult<PaginationResult<Model>> {
    let res = Model::pagination(db, query).await?;

    Ok(res)
}

async fn get_all(client: &Client) -> ServiceResult<Vec<Model>> {
    let res = Model::find_all_from_client(client).await?;

    Ok(res)
}

async fn clear_logs(db: &Database, limit: u32) -> ServiceResult<()> {
    let (start_time, _) = get_recent_days(limit)?;
    let filter = doc! {
        "create_time": {
            "$lte": start_time,
        }
    };
    info!("query db: {:?}", logs::Model::col(db).count_documents(None, None).await?);
    info!("filter: {:?}", &filter);
    let count = logs::Model::col(db).count_documents(filter.clone(), None).await?;
    info!("count: {}", count);
    logs::Model::delete_many(
        db,
        filter.clone(),
    ).await?;
    Ok(())
}
async fn clear_networks(db: &Database, limit: u32) -> ServiceResult<()> {
    let (start_time, _) = get_recent_days(limit)?;
    info!("from {}", start_time);
    logs_network::Model::delete_many(
        db,
        doc! {
            "create_time": {
                "$lte": start_time,
            },
        },
    ).await?;
    Ok(())
}
async fn clear_errors(db: &Database, limit: u32) -> ServiceResult<()> {
    let (start_time, _) = get_recent_days(limit)?;
    logs_error::Model::delete_many(
        db,
        doc! {
            "create_time": {
                "$lte": start_time,
            },
        },
    ).await?;
    Ok(())
}

pub fn get_recent_days(num: u32) -> ServiceResult<(DateTime, DateTime)>{
    let now = chrono::Utc::now();
    if let (Some(end_time), Some(start_time)) = (
        now.checked_sub_signed(chrono::Duration::seconds(1)),
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

pub async fn gc_logs(client: &Client, limit: u32) -> ServiceResult<()> {
    let appids: Vec<String>  = get_all(client)
        .await?
        .iter()
        .map(|item| item._id.to_string())
        .collect();

    if let Err(err) = crate::services::apps::aggregate_devices(&client, limit).await {
        error!("{}", err.to_string());
    }

    join_all(appids.iter().map(|appid| async {
        let db = db::DbApp::get_by_appid(client, appid);
        let res = clear_logs(&db, limit).await;
        info!("gc {} logs successfully", appid.clone());
        res
    })).await;

    Ok(())
}
pub async fn gc_log(client: &Client, appid: &str, limit: u32) -> ServiceResult<()> {
    // let appids: Vec<String>  = get_all(client)
    //     .await?
    //     .iter()
    //     .map(|item| item._id.to_string())
    //     .collect();

    if let Err(err) = crate::services::apps::aggregate_devices(&client, limit).await {
        error!("{}", err.to_string());
    }

    // join_all(appids.iter().map(|appid| async {
    let db = db::DbApp::get_by_appid(client, appid);
    clear_logs(&db, limit).await?;
    info!("gc {} logs successfully", appid);
    // })).await;

    Ok(())
}
pub async fn gc_networks(client: &Client, limit: u32) -> ServiceResult<()> {
    let appids: Vec<String>  = get_all(client)
        .await?
        .iter()
        .map(|item| item._id.to_string())
        .collect();

    join_all(appids.iter().map(|appid| async {
        let db = db::DbApp::get_by_appid(client, appid);
        let res = clear_networks(&db, limit).await;
        info!("gc {} api successfully", appid.clone());
        res
    })).await;

    Ok(())
}
pub async fn gc_errors(client: &Client, limit: u32) -> ServiceResult<()> {
    let appids: Vec<String>  = get_all(client)
        .await?
        .iter()
        .map(|item| item._id.to_string())
        .collect();

    join_all(appids.iter().map(|appid| async {
        let db = db::DbApp::get_by_appid(client, appid);
        let res = clear_errors(&db, limit).await;
        info!("gc {} err successfully", appid.clone());
        res
    })).await;

    Ok(())
}

pub async fn aggregate_devices(client: &Client, limit: u32) -> ServiceResult<()> {
    let appids: Vec<String>  = get_all(client)
        .await?
        .iter()
        .map(|item| item._id.to_string())
        .collect();

    join_all(appids.iter().map(|appid| async {
        let db = db::DbApp::get_by_appid(client, appid);
        let res = super::statistics::aggregate_devices(&db, limit).await;
        info!("aggregate {} device successfully", appid.clone());
        res
    })).await;

    Ok(())
}
