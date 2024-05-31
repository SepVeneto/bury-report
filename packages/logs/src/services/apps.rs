use actix_web::web;
use anyhow::Context;
use mongodb::Database;

use super::ServiceResult;

pub async fn _create_collections(db: &web::Data<Database>, appid: &str) -> ServiceResult<()> {
    let log_col = format!("{}_log", appid);
    let api_col = format!("{}_api", appid);
    db.create_collection(&log_col, None).await
        .with_context(|| format!("创建集合失败: {}", log_col))?;
    db.create_collection(&api_col, None).await
        .with_context(|| format!("创建集合失败: {}", api_col))?;
    Ok(())
}
