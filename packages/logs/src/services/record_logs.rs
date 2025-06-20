use std::collections::HashMap;

use actix::Addr;
use actix_web::{web, HttpRequest, HttpResponse};
use actix_web_actors::ws;
use bson::doc;
use maplit::hashmap;
use mongodb::{Database, Client};
use anyhow::anyhow;

use crate::{
    apis::{record::{ErrorFilter, FilterNetwork, LogFilter}, Query},
    db,
    model::{
        apps,
        logs,
        logs_error,
        logs_network,
        CreateModel,
        PaginationModel,
        PaginationOptions,
        PaginationResult,
        QueryBase,
        QueryModel,
    },
    services::gen_timerange_doc
};

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
pub async fn record(client: &Client, db: &Database, data: &logs::RecordPayload) -> ServiceResult<()> {
    let appid = data.get_appid();
    let app = apps::Model::find_by_id(db, &appid).await?;
    if let None = app {
        return Err(anyhow!("没有对应的应用").into());
    }

    match data {
        logs::RecordPayload::V1(v1) => {
            let db = &db::DbApp::get_by_appid(client, &appid);
            match v1.normalize_from() {
                logs::RecordItem::Log(log) => {
                    logs::Model::insert_one(db, log).await?;
                },
                logs::RecordItem::Network(net) => {
                    logs_network::Model::insert_one(db, net).await?;
                },
                logs::RecordItem::Error(err) => {
                    logs_error::Model::insert_one(db, err).await?;
                },
                logs::RecordItem::Custom(data) => {
                    logs::Model::insert_one(db, data).await?;
                }
            }
        },
        logs::RecordPayload::V2(v2) => {
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
fn group_records<'a>(list: &'a Vec<logs::RecordV1>) -> HashMap<&'a str, RecordList> {
    let mut list_collect = vec![];
    let mut list_network = vec![];
    let mut list_error = vec![];

    list.iter().for_each(|item| {
        match item.normalize_from() {
            logs::RecordItem::Log(log) => {
                list_collect.push(log);
            },
            logs::RecordItem::Network(net) => {
                list_network.push(net);
            },
            logs::RecordItem::Error(err) => {
                list_error.push(err);
            },
            logs::RecordItem::Custom(log) => {
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

pub fn send_to_ws(svr: &Addr<WsActor>, data: &logs::RecordPayload) -> ServiceResult<()> {
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

pub async fn get_log_list(
    db: &Database,
    data: Query<LogFilter>
) -> ServiceResult<PaginationResult<logs::Model>> {
    let mut doc = doc! {
        "$and": [
            {
                "type": { "$ne": "__BR_COLLECT_INFO__" }
            }
        ]
    };
    let query = data.query;

    if let Some(uuid) = query.uuid {
        doc.insert("uuid", uuid);
    }
    if let Some(data) = query.data {
        doc.insert("data", doc! { "$regex": data });
    }
    if let Some(r#type) = query.r#type {
        // doc.insert("type", doc! { "$regex": r#type });
        let mut and = doc.get_array("$and").unwrap().clone();
        and.push(doc! {
            "type": { "$regex": r#type },
        }.into());
        doc.remove("$and");
        doc.insert("$and", and);
    }

    let res = logs::Model::pagination(
        db,
        data.page,
        data.size,
        PaginationOptions::new().query(doc).build(),
    ).await?;
    Ok(res)
}

pub async fn get_error_list(
    db: &Database,
    data: Query<ErrorFilter>
) -> ServiceResult<PaginationResult<logs_error::Model>> {
    let mut doc = doc! {};

    let query = data.query;
    if let Some(uuid) = query.uuid {
        doc.insert("uuid", uuid);
    }
    if let (Some(start_time), Some(end_time)) = (query.start_time, query.end_time) {
        let time_doc = gen_timerange_doc(start_time, end_time)?;
        doc.insert("create_time", time_doc);
    }

    let res = logs_error::Model::pagination(
        db,
        data.page,
        data.size,
        PaginationOptions::new().query(doc).build(),
    ).await?;
    Ok(res)
}

pub async fn get_network_list(db: &Database, data: Query<FilterNetwork>) -> ServiceResult<PaginationResult<logs_network::Model>> {
    let mut doc = doc! {};

    let query = data.query;
    if let Some(uuid) = query.uuid {
        doc.insert("uuid", uuid);
    }
    if let (Some(start_time), Some(end_time)) = (query.start_time, query.end_time) {
        let time_doc = gen_timerange_doc(start_time, end_time)?;
        doc.insert("create_time", time_doc);
    }
    if let Some(payload) = query.payload {
        doc.insert("data.body",doc! {
            "$regex": payload
        });
    }
    if let Some(response) = query.response {
        doc.insert("data.response", doc! {
            "$regex": response,
        });
    }
    if let Some(page) = query.send_page {
        doc.insert("data.page", doc! {
            "$regex": page,
        });
    }
    if let Some(status) = query.status {
        doc.insert("data.status", status);
    }
    if let Some(url) = query.url {
        doc.insert("data.url", doc! {
            "$regex": url
        });
    }

    let res = logs_network::Model::pagination(
        db,
        data.page,
        data.size,
        PaginationOptions::new()
            .query(doc)
            .projection(doc! {
                "data.body": 0,
                "data.response": 0,
                "data.responseHeaders": 0,
            })
            .build(),
    ).await?;
    Ok(res)
}

pub async fn get_network_detail(
    db: &Database,
    id: String
) -> ServiceResult<Option<QueryBase<logs_network::Model>>> {
    let res = logs_network::Model::find_by_id(db, &id).await?;
    Ok(res)
}
