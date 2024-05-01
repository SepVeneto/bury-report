use log::info;
use mongodb::{bson::{oid, Bson}, results::UpdateResult, Database};
use crate::model::source::*;
use super::ServiceResult;

pub async fn options(db: &Database, appid: &str) -> ServiceResult<Vec<Model>> {
    let res = Model::find_many(&db, &appid).await.unwrap();
    Ok(res)
}

pub async fn list(db: &Database, data: QueryPayload) -> ServiceResult<PaginationResult> {
    let res = Model::pagination(db, &data).await?;
    Ok(res)
}
pub async fn add(db: &Database, data: BasePayload) -> ServiceResult<String> {
    let filter = Filter {
        name: None,
        value: Some(data.value.to_owned()),
        appid: data.appid.to_string(),
    };
    let res = Model::find_one(db, filter).await?;
    info!("{:?}, {}, {}", res, data.value, data.appid);

    if let Some(_) = res {
        return Err("数据源已存在".into());
    }

    let res = Model::insert(db, &data).await?;
    let oid = match res.inserted_id {
        Bson::ObjectId(oid) => oid.to_string(),
        _ => {
            return Err("Fail to get inserted id".into());
        },
    };
    Ok(oid)
}

pub async fn delete(db: &Database, id: &String) -> ServiceResult<()> {
    Model::delete_one(db, id).await?;
    Ok(())
}

pub async fn update(db: &Database, id: &String, data: BasePayload) -> ServiceResult<UpdateResult> {
    let oid = oid::ObjectId::parse_str(id)?;
    let source = Model::find_by_id(db, id).await?;
    if let None = source {
        return Err("找不到对应的数据源".into());
    }
    let res = Model::update_one(db, &oid, &data).await?;
    Ok(res)
}

pub async fn detail(db: &Database, id: &String) -> ServiceResult<Option<Model>> {
    let res = Model::find_by_id(db, id).await?;
    Ok(res)
}
