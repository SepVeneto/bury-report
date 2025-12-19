use std::collections::HashMap;

use bson::doc;
use futures_util::future::join_all;
use log::{debug, error};
use maplit::hashmap;
use mongodb::{Database, Client};
use anyhow::anyhow;
use rdkafka::producer::BaseProducer;

use crate::{
    alert::{self, alert_error}, db, model::{
        CreateModel, apps, logs, logs_error, logs_network
    }, services::task::{send_batch_to_kafka, send_to_kafka}
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
                logs::RecordItem::Error(err) => {
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
            let error_list = match &group["error"] {
                RecordList::ErrorList(l) => Some(l),
                _ => {
                    error!("错误列表类型异常");
                    None
                }
            };
            if let Some(error_list) = error_list {
                error_list.iter().for_each(|raw| {
                    alert_error(producer, &appid, raw);
                });
            }
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
            logs::RecordItem::Error(err) => {
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
