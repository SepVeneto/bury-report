use log::info;
use mongodb::{bson::{oid, Bson}, results::UpdateResult, Database};
use crate::model::source::*;
use super::ServiceResult;
use anyhow::{anyhow, Context};

pub async fn options(db: &Database, appid: &str) -> ServiceResult<Vec<Model>> {
    let res = Model::find_many(&db, &appid).await.unwrap();
    Ok(res)
}

pub async fn list(db: &Database, data: QueryPayload) -> ServiceResult<PaginationResult> {
    let res = Model::pagination(db, &data).await?;
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
    let _filter = Filter {
        name: None,
        value: None,
        appid: data.appid.to_string(),
        pid: Some(pid.to_string()),
    };
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
    let filter = Filter {
        name: None,
        value: Some(data.value.to_owned()),
        appid: data.appid.to_string(),
        pid: None,
    };
    let res = Model::find_one(db, filter).await?;
    info!("{:?}, {}, {}", res, data.value, data.appid);

    if let Some(_) = res {
        return Err(anyhow!("数据源已存在").into());
    }

    let res = Model::insert(db, &data).await?;
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
    let oid = oid::ObjectId::parse_str(id).with_context(|| format!("transform with {}", id))?;
    let source = Model::find_by_id(db, id).await.unwrap();
    if let None = source {
        return Err(anyhow!("找不到对应的数据源").into());
    }
    let res = Model::update_one(db, &oid, &data).await.unwrap();
    Ok(res)
}

pub async fn detail(db: &Database, id: &String) -> ServiceResult<Option<Model>> {
    let res = Model::find_by_id(db, id).await?;
    Ok(res)
}
