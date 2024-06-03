use std::collections::HashMap;

use actix::Addr;
use actix_web::{web, HttpRequest, HttpResponse};
use actix_web_actors::ws;
use maplit::hashmap;
use mongodb::Database;
use anyhow::anyhow;

use crate::model::{
    apps,
    logs::{self, Model, RecordPayload, RecordV1},
    CreateModel,
    PaginationResult,
    PaginationModel,
    QueryPayload,
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
pub async fn record(db: &Database, data: &RecordPayload) -> ServiceResult<()> {
    let appid = data.get_appid();
    let app = apps::Model::find_by_id(db, &appid).await?;
    if let None = app {
        return Err(anyhow!("没有对应的应用").into());
    }

    match data {
        RecordPayload::V1(_) => {
            // Model::insert_many(db, data).await?;
        },
        RecordPayload::V2(v2) => {
            let group  = group_records(&v2.data);
            let appid = v2.appid.to_string();
            // let collect = RecordPayload::V2(RecordV2 {
            //     appid: appid.to_owned(),
            //     data: group["collect"],
            // });
            // let network = RecordPayload::V2(RecordV2 {
            //     appid: appid.to_owned(),
            //     data: group["network"],
            // });
            // let error = RecordPayload::V2(RecordV2 {
            //     appid: appid.to_owned(),
            //     data: group["error"],
            // });
            logs::Model::insert_many(db, &appid, group["collect"].clone()).await?;
            logs::Model::insert_many(db, &appid, group["network"].clone()).await?;
            logs::Model::insert_many(db, &appid, group["error"].clone()).await?;
        }
    }

    // Model::insert_many(db, &data).await?;
    Ok(())
}

fn group_records<'a>(list: &'a Vec<RecordV1>) -> HashMap<&'a str, Vec<logs::Model>> {
    let mut list_collect = vec![];
    let mut list_network = vec![];
    let mut list_error = vec![];

    list.iter().for_each(|item| {
        if item.r#type == "__BR_COLLECT_INFO__" {
            list_collect.push(item.normalize_from());
        } else if item.r#type == "__BR_COLLECT_ERROR__" {
            list_error.push(item.normalize_from());
        } else if item.r#type == "__BR_API__" {
            list_network.push(item.normalize_from());
        }
    });

    hashmap! {
        "collect" => list_collect,
        "network" => list_network,
        "error" => list_error,
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

pub async fn get_error_list(db: &Database, appid: &str, data: &QueryPayload) -> ServiceResult<PaginationResult<Model>> {
    let res = logs::Model::pagination(db, appid, data).await?;
    Ok(res)
}