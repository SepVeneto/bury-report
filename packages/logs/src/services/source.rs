use mongodb::{results::InsertOneResult, Database};
use crate::model::source::*;
use super::{ServiceError, ServiceResult};

pub async fn add(db: &Database, data: BasePayload<Option<String>>) -> ServiceResult<InsertOneResult> {
    let filter = Filter { name: Some(data.name.to_owned()) };
    let res = Model::find_one(db, filter).await?;

    if let Some(_) = res {
        return Err(ServiceError::LogicError(String::from("数据源已存在")));
    }

    Ok(Model::insert(db, &data).await?)
}