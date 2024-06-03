use anyhow::{anyhow, Context};
use log::info;
use mongodb::Database;

use crate::{apis::apps::CreatePayload, model::{apps::Model, PaginationResult, QueryPayload}};

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
