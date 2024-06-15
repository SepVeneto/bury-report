use std::collections::HashMap;

use actix::Addr;
use actix_web::{web, HttpRequest, HttpResponse};
use actix_web_actors::ws;
use maplit::hashmap;
use mongodb::{Database, Client};
use anyhow::anyhow;

use crate::{db, model::{
    apps,
    logs::{self, Model, RecordItem, RecordPayload, RecordV1},
    logs_error,
    logs_network,
    CreateModel, PaginationModel, PaginationResult, QueryPayload
}};

use super::{actor::{LogMessage, WsActor}, ws::WebsocketConnect, ServiceError, ServiceResult};

pub async fn check_appid(db: &Database, appid: &str) -> ServiceResult<bool> {
    let app = apps::Model::find_by_id(&db, appid).await?;
    if let None = app {
        Err(anyhow!("找不到指定应用").into())
    } else {
        Ok(true)
    }
}

#[derive(Clone)]
enum RecordList {
    LogList(Vec<logs::Model>),
    NetworkList(Vec<logs_network::Model>),
    ErrorList(Vec<logs_error::Model>),
    CustomList(Vec<logs::Model>),
}
pub async fn record(client: &Client, db: &Database, data: &RecordPayload) -> ServiceResult<()> {
    let appid = data.get_appid();
    let app = apps::Model::find_by_id(db, &appid).await?;
    if let None = app {
        return Err(anyhow!("没有对应的应用").into());
    }

    match data {
        RecordPayload::V1(v1) => {
            let db = &db::DbApp::get_by_appid(client, &appid);
            match v1.normalize_from() {
                RecordItem::Log(log) => {
                    logs::Model::insert_one(db, log).await?;
                },
                RecordItem::Network(net) => {
                    logs_network::Model::insert_one(db, net).await?;
                },
                RecordItem::Error(err) => {
                    logs_error::Model::insert_one(db, err).await?;
                },
                RecordItem::Custom(data) => {
                    logs::Model::insert_one(db, data).await?;
                }
            }
        },
        RecordPayload::V2(v2) => {
            let group  = group_records(&v2.data);
            let appid = v2.appid.to_string();

            let db = &db::DbApp::get_by_appid(client, &appid);
            insert_group(db, &group["collect"]).await?;
            insert_group(db, &group["network"]).await?;
            insert_group(db, &group["error"]).await?;
        }
    }

    // Model::insert_many(db, &data).await?;
    Ok(())
}

async fn insert_group(db: &Database, list: &RecordList) -> anyhow::Result<(), ServiceError>{
    match list {
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
    }
    Ok(())
}
fn group_records<'a>(list: &'a Vec<RecordV1>) -> HashMap<&str, RecordList> {
    let mut list_collect = vec![];
    let mut list_network = vec![];
    let mut list_error = vec![];

    list.iter().for_each(|item| {
        match item.normalize_from() {
            RecordItem::Log(log) => {
                list_collect.push(log);
            },
            RecordItem::Network(net) => {
                list_network.push(net);
            },
            RecordItem::Error(err) => {
                list_error.push(err);
            },
            RecordItem::Custom(log) => {
                list_collect.push(log);
            }
        }
    });

    hashmap! {
        "collect" => RecordList::LogList(list_collect),
        "network" => RecordList::NetworkList(list_network),
        "error" => RecordList::ErrorList(list_error),
        "custom" => RecordList::CustomList(vec![]),
    }
}

pub fn send_to_ws(svr: &Addr<WsActor>, data: &RecordPayload) -> ServiceResult<()> {
    let text = match data.to_string() {
        Ok(res) => res,
        Err(err) => {
            return Err(ServiceError::ToStrError {
                origin: data.clone(),
                result: err.to_string()
            });
        }
    };
    svr.do_send(LogMessage {
        app_id: data.get_appid(),
        text,
    });
    Ok(())
}

pub fn create_ws(
    appid: String,
    srv: web::Data<Addr<WsActor>>,
    req: &HttpRequest,
    stream: web::Payload,
) -> ServiceResult<HttpResponse> {
    match ws::start(
        WebsocketConnect::new(appid, srv.get_ref().clone()),
        req,
        stream,
    ) {
        Ok(res) => Ok(res),
        Err(err) => Err(anyhow!(err.to_string()).into())
    }
}

pub async fn get_error_list(db: &Database, data: &QueryPayload) -> ServiceResult<PaginationResult<Model>> {
    let res = logs::Model::pagination(db, data).await?;
    Ok(res)
}

pub async fn get_network_list(db: &Database, data: &QueryPayload) -> ServiceResult<PaginationResult<logs_network::Model>> {
    let res = logs_network::Model::pagination(db, data).await?;
    Ok(res)
}

pub async fn get_log_list(db: &Database, data: &QueryPayload) -> ServiceResult<PaginationResult<logs::Model>> {
    let res = logs::Model::pagination(db, data).await?;
    Ok(res)
}
