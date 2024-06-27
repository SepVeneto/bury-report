use bson::doc;
use mongodb::Database;

use crate::model::{device::{DeviceInfo, Model}, logs, QueryModel};

use super::ServiceResult;

pub async fn get_device_by_uuid(db: &Database, device_id: &str) -> ServiceResult<Option<DeviceInfo>> {
    let mut device_info = None;
    if let Some(res) = Model::find_by_uuid(db, device_id).await? {
        device_info = Some(res.model.data)
    } else {
        if let Some(res) = logs::Model::find_one(db, doc! {
            "type": "__BR_COLLECT_INFO__",
            "uuid": device_id,
        }).await? {
            device_info = Some(res.model.data);
        }
    }

    Ok(device_info)
}