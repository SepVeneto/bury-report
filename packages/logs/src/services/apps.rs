use actix_web::web;
use anyhow::Context;
use mongodb::Database;

use super::ServiceResult;

pub async fn _create_collections(db: &web::Data<Database>, appid: &str) -> ServiceResult<()> {
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
