use bson::doc;
use mongodb::Database;

use crate::{
    apis::Query,
    model::{device::{self, DeviceInfo, Model}, logs, PaginationModel, PaginationOptions, PaginationResultTotal, QueryModel}
};

use super::{gen_timerange_doc, ServiceResult};

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

// pub async fn get_device_pagination(
//     db: &Database,
//     query: Query<DeviceFilter>
// ) -> ServiceResult<PaginationResultTotal<device::Model>> {
//     let Query { page, size, query } = query;
//     let mut doc = doc! {};

//     if let Some(uuid) = query.uuid {
//         doc.insert("uuid", uuid);
//     }
//     if let (Some(start_time), Some(end_time)) = (query.start_time, query.end_time) {
//         let time_doc = gen_timerange_doc(start_time, end_time)?;
//         doc.insert("last_open", time_doc);
//     }

//     let res = device::Model::pagination_with_total(
//         db,
//         page,
//         size,
//         PaginationOptions::new().query(doc).build(),
//     ).await?;
//     Ok(res)
// }
