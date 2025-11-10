use bson::doc;
use log::info;
use mongodb::Database;
use crate::model::{QueryBase, QueryModel, logs_track};

use crate::services::ServiceResult;

pub async fn get_track_list(
    db: &Database,
    device_id: &str,
) -> ServiceResult<Vec<QueryBase<logs_track::Model>>> {
    let res = logs_track::Model::find_all(db, doc! {
        "uuid": device_id,
    }).await?;
    info!("get_track_list: {:?}", res);

    Ok(res)
}