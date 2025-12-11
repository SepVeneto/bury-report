use std::collections::HashMap;

use bson::doc;
use futures_util::future::join_all;
use log::{debug, error};
use maplit::hashmap;
use mongodb::{Database, Client};
use anyhow::anyhow;
use rdkafka::producer::BaseProducer;

use crate::{
    db,
    model::{
        CreateModel, apps, logs, logs_error, logs_network
    },
    services::task::{send_batch_to_kafka, send_to_kafka}
};

use super::{ServiceError, ServiceResult};

// pub async fn check_appid(db: &Database, appid: &str) -> ServiceResult<bool> {
//     let app = apps::Model::find_by_id(&db, appid).await?;
//     if let None = app {
//         error!("找不到指定应用");
//         Err(anyhow!("找不到指定应用").into())
//     } else {
//         Ok(true)
//     }
// }

#[derive(Clone)]
pub enum RecordList {
    DeviceList(Vec<logs::Device>),
    LogList(Vec<logs::Model>),
    NetworkList(Vec<logs_network::Model>),
    ErrorList(Vec<logs_error::Model>),
    TrackList(Vec<logs::Model>),
    CustomList(Vec<logs::Model>),
}
pub async fn record(
    client: &Client,
    db: &Database,
    data: &logs::RecordPayload,
    producer: &BaseProducer,
    ip: Option<String>,
) -> ServiceResult<()> {
    debug!("record log");
    let appid = data.get_appid();
    let app = apps::Model::find_by_id(db, &appid).await?;
    if let None = app {
        error!("找不到指定应用");
        return Err(anyhow!("没有对应的应用").into());
    }

    match data {
        logs::RecordPayload::V1(v1) => {
            let db = &db::DbApp::get_by_appid(client, &appid);
            match v1.normalize_from(ip) {
                logs::RecordItem::Device(device) => {
                    let uuid = &device.uuid;
                    let session = &device.session;
                    if let Some(session) = session {
                        let data = logs::Session {
                            uuid: uuid.to_string(),
                            session: session.to_string(),
                        };
                        let filter = doc! {"session": session};
                        logs::Session::insert_unique(db, &data, filter, None).await?;
                    }
                    logs::Device::insert_unique(
                        db,
                        &device,
                        doc! {"uuid": uuid},
                        doc! { "session": session },
                    ).await?;
                },
                // logs::RecordItem::Log(log) => {
                //     logs::Model::insert_one(db, log).await?;
                // },
                logs::RecordItem::Network(net) => {
                    logs_network::Model::insert_one(db, &net).await?;
                },
                logs::RecordItem::Error((err, normalized)) => {
                    logs_error::Model::insert_one(db, &err).await?;
                },
                logs::RecordItem::Track(track) => {
                    send_to_kafka(producer, &track);
                }
                logs::RecordItem::Custom(data) => {
                    logs::Model::insert_one(db, &data).await?;
                }
            }
        },
        logs::RecordPayload::V2(v2) => {
            let group  = group_records(&v2.data, ip);
            let appid = v2.appid.to_string();

            let db = &db::DbApp::get_by_appid(client, &appid);

            let futures = vec![
                insert_group(db, &group["collect"]),
                insert_group(db, &group["network"]),
                insert_group(db, &group["error"]),
                insert_group(db, &group["device"]),
            ];

            join_all(futures).await.into_iter().collect::<anyhow::Result<(), ServiceError>>()?;
            send_batch_to_kafka(producer, &group["track"]);
        }
    }

    // Model::insert_many(db, &data).await?;
    Ok(())
}

async fn insert_group(db: &Database, list: &RecordList) -> anyhow::Result<(), ServiceError>{
    match list {
        RecordList::DeviceList(data) => {
            if data.len() == 0 {
                return Ok(());
            }
            for device in data.iter() {
                let uuid = &device.uuid;
                let session = &device.session;
                if let Some(session) = session {
                    let data = logs::Session {
                        uuid: uuid.to_string(),
                        session: session.to_string(),
                    };
                    logs::Session::insert_unique(db, &data, doc! { "session": session }, None).await?;
                }
                logs::Device::insert_unique(
                    db,
                    device,
                    doc! {"uuid": uuid},
                    doc! {"session": session}
                ).await?;
            }
        },
        RecordList::LogList(data) => {
            if data.len() == 0 {
                return Ok(());
            }
            logs::Model::insert_many(db, data).await?;
        },
        RecordList::NetworkList(data) => {
            if data.len() == 0 {
                return Ok(());
            }
            logs_network::Model::insert_many(db, data).await?;
        },
        RecordList::ErrorList(data) => {
            if data.len() == 0 {
                return Ok(());
            }
            logs_error::Model::insert_many(db, data).await?;
        },
        RecordList::CustomList(data) => {
            if data.len() == 0 {
                return Ok(());
            }
            logs::Model::insert_many(db, data).await?;
        }
        _ => {}
    }
    Ok(())
}
fn group_records<'a>(list: &'a Vec<logs::RecordV1>, ip: Option<String>) -> HashMap<&'a str, RecordList> {
    let mut list_device = vec![];
    let mut list_collect = vec![];
    let mut list_network = vec![];
    let mut list_error = vec![];
    let mut list_track = vec![];

    list.iter().for_each(|item| {
        match item.normalize_from(ip.clone()) {
            logs::RecordItem::Device(log) => {
                list_device.push(log);
            },
            // logs::RecordItem::Log(log) => {
            //     list_collect.push(log);
            // },
            logs::RecordItem::Network(net) => {
                list_network.push(net);
            },
            logs::RecordItem::Error((err, normalized)) => {
                list_error.push(err);
            },
            logs::RecordItem::Track(track) => {
                debug!("track: {:?}", track);
                list_track.push(track)
            }
            logs::RecordItem::Custom(log) => {
                list_collect.push(log);
            }
        }
    });

    hashmap! {
        "device" => RecordList::DeviceList(list_device),
        "collect" => RecordList::LogList(list_collect),
        "network" => RecordList::NetworkList(list_network),
        "error" => RecordList::ErrorList(list_error),
        "track" => RecordList::TrackList(list_track),
        "custom" => RecordList::CustomList(vec![]),
    }
}

// pub fn _send_to_ws(svr: &Addr<WsActor>, data: &logs::RecordPayload) -> ServiceResult<()> {
//     let text = match data.to_string() {
//         Ok(res) => res,
//         Err(err) => {
//             error!("{}", err);
//             return Err(ServiceError::ToStrError {
//                 origin: data.clone(),
//                 result: err.to_string()
//             });
//         }
//     };
//     svr.do_send(LogMessage {
//         app_id: data.get_appid(),
//         text,
//     });
//     Ok(())
// }

// pub fn create_ws(
//     appid: String,
//     srv: web::Data<Addr<WsActor>>,
//     req: &HttpRequest,
//     stream: web::Payload,
// ) -> ServiceResult<HttpResponse> {
//     match ws::start(
//         WebsocketConnect::new(appid, srv.get_ref().clone()),
//         req,
//         stream,
//     ) {
//         Ok(res) => Ok(res),
//         Err(err) => {
//             error!("{}", err);
//             Err(anyhow!(err.to_string()).into())
//         }
//     }
// }

// pub async fn get_log_list(
//     db: &Database,
//     data: Query<LogFilter>
// ) -> ServiceResult<PaginationResult<logs::Model>> {
//     let mut doc = doc! {
//         "$and": [
//             {
//                 "type": { "$ne": "__BR_COLLECT_INFO__" }
//             }
//         ]
//     };
//     let query = data.query;

//     if let Some(uuid) = query.uuid {
//         doc.insert("uuid", uuid);
//     }
//     if let Some(data) = query.data {
//         doc.insert("data", doc! { "$regex": data });
//     }
//     if let Some(r#type) = query.r#type {
//         // doc.insert("type", doc! { "$regex": r#type });
//         let mut and = doc.get_array("$and").unwrap().clone();
//         and.push(doc! {
//             "type": { "$regex": r#type },
//         }.into());
//         doc.remove("$and");
//         doc.insert("$and", and);
//     }

//     let res = logs::Model::pagination(
//         db,
//         data.page,
//         data.size,
//         PaginationOptions::new().query(doc).build(),
//     ).await?;
//     Ok(res)
// }
