use log::info;
use mongodb::{bson::{doc, Bson}, results::UpdateResult, Database};
use crate::model::{
    source::*, CreateModel, DeleteModel, EditModel, PaginationModel, PaginationOptions, PaginationResult, QueryModel, QueryPayload
};
use super::ServiceResult;
use anyhow::anyhow;

pub async fn options(db: &Database) -> ServiceResult<Vec<Model>> {
    let res = Model::find_all(db, None).await?;
    Ok(res)
}

pub async fn list(db: &Database, data: QueryPayload) -> ServiceResult<PaginationResult<Model>> {
    let doc = doc! {};
    // TODO
    let res = Model::pagination(
        db,
        1,
        20,
        PaginationOptions::new().query(doc).build()
    ).await?;
    Ok(res)
}
pub async fn add(db: &Database, data: BasePayload) -> ServiceResult<String> {
    match data.pid {
        Some(pid) => {
            // TODO
            // let _ = self::add_child(db, &pid, data.clone()).await?;
            Ok(pid)
        }
        None => {
            self::add_root(db, data).await
        }
    }
}
// TODO: source tree
pub async fn _add_child(db: &Database, pid: &String, data: BasePayload) -> ServiceResult<()> {
    let appid = data.appid.to_string();
    let res =Model::find_by_id(db, pid).await?;
    if let None = res {
        return Err(anyhow!("找不到对应的数据源").into());
    } else {
        // TODO
        // res.child
        Ok(())
    }
}
pub async fn add_root(db: &Database, data: BasePayload) -> ServiceResult<String> {
    let appid = data.appid.to_string();
    let query = doc! {
        "appid": &appid,
        "name": &data.name,
        "value": &data.value,
    };
    let res = Model::find_one(db, query).await?;
    info!("{:?}, {}, {}", res, data.value, data.appid);

    if let Some(_) = res {
        return Err(anyhow!("数据源已存在").into());
    }

    let new_doc = Model {
        name: data.name,
        value: data.value,
        appid: data.appid,
        level: data.level,
        children: vec![],
        _id: None,
    };
    let res = Model::insert_one(db, new_doc).await?;
    let oid = match res.inserted_id {
        Bson::ObjectId(oid) => oid.to_string(),
        _ => {
            return Err(anyhow!("Fail to get inserted id").into());
        },
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
        name: data.name,
        value: data.value,
        appid: data.appid,
        level: data.level,
        children: vec![],
        _id: None,
    };
    let res = Model::update_one(db, id, &new_doc).await.unwrap();
    Ok(res)
}

pub async fn detail(db: &Database, id: &String) -> ServiceResult<Option<Model>> {
    let res = Model::find_by_id(db, id).await?;
    Ok(res)
}
