use mongodb::Database;

use crate::model::{device::Model, QueryModel};

use super::ServiceResult;

pub async fn get_device_by_id(db: &Database, device_id: &str) -> ServiceResult<Option<Model>> {
    let res = Model::find_by_id(db, device_id).await?;
    Ok(res)
}