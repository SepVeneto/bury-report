use std::str::FromStr;

use super::ServiceResult;
use crate::{model::{
    source::*, CreateModel, DeleteModel, EditModel, PaginationModel, PaginationOptions, PaginationResult, QueryBase, QueryModel, QueryPayload
}, utils::TreeList};
use anyhow::anyhow;
use log::info;
use mongodb::{
    bson::{doc, Bson},
    results::UpdateResult,
    Database,
};

pub async fn options(db: &Database) -> ServiceResult<Vec<QueryBase<Model>>> {
    let res = Model::find_all(db, None).await?;
    Ok(res)
}

pub async fn list(db: &Database) -> ServiceResult<TreeList<QueryBase<Model>>> {
    let res = Model::find_all_as_tree(db, None).await?;
    Ok(res)
}
pub async fn add(db: &Database, data: BasePayload) -> ServiceResult<String> {
    self::add_root(db, data).await
}
// pub async fn add_child(db: &Database, pid: &String, data: BasePayload) -> ServiceResult<()> {
//     let res = Model::find_by_id(db, pid).await?;
//     if let Some(res) = res {
//     } else {
//         return Err(anyhow!("找不到对应的数据源").into());
//     }
//     Ok(())
// }
pub async fn add_root(db: &Database, data: BasePayload) -> ServiceResult<String> {
    // let appid = data.appid.to_string();
    let query = doc! {
        "name": &data.name,
        "value": &data.value,
    };
    let res = Model::find_one(db, query).await?;
    // info!("{:?}, {}, {}", res, data.value, data.appid);

    if let Some(_) = res {
        return Err(anyhow!("数据源已存在").into());
    }

    let new_doc = Model {
        name: data.name,
        value: data.value,
        pid: data.pid,
        // appid: data.appid,
        // level: data.level,
        // children: vec![],
    };
    let res = Model::insert_one(db, new_doc).await?;
    let oid = match res.inserted_id {
        Bson::ObjectId(oid) => oid.to_string(),
        _ => {
            return Err(anyhow!("Fail to get inserted id").into());
        }
    };
    Ok(oid)
}

pub async fn delete(db: &Database, id: &String) -> ServiceResult<()> {
    Model::delete_one(db, id).await?;
    Ok(())
}

pub async fn update(db: &Database, id: &String, data: BasePayload) -> ServiceResult<UpdateResult> {
    let source = Model::find_by_id(db, id).await.unwrap();
    if let None = source {
        return Err(anyhow!("找不到对应的数据源").into());
    }
    let new_doc = Model {
        pid: data.pid,
        name: data.name,
        value: data.value,
    };
    let res = Model::update_one(db, id, &new_doc).await.unwrap();
    Ok(res)
}

pub async fn detail(db: &Database, id: &String) -> ServiceResult<Option<QueryBase<Model>>> {
    let res = Model::find_by_id(db, id).await?;
    Ok(res)
}
