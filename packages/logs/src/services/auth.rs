use actix_web::web;
use mongodb::{results::InsertOneResult, Database};
use md5;

use crate::model::{
    captcha,
    users::{Filter, LoginPayload, Model, RegisterPayload},
};

use super::{ServiceError, ServiceResult};

pub async fn register(db: &web::Data<Database>, data: &RegisterPayload) -> ServiceResult<InsertOneResult> {
    let res = Model::find_one(db, Filter { name: Some(data.name.to_owned()) }).await?;
    if let Some(_) = res {
        return Err(ServiceError::LogicError("用户已存在".to_owned()))
    }


    let digest = md5::compute(data.password.to_owned());
    let new_user = Model {
        name: data.name.to_owned(),
        password: format!("{:x}", digest),
    };

    Ok(Model::insert_one(db, &new_user).await?)
}

pub async fn login(db: &web::Data<Database>, data: &LoginPayload) -> ServiceResult<()> {
    let user: Option<Model> = Model::find_one(db, Filter { name: Some(data.name.to_owned()) }).await?;

    let is_valid = check_login(db, data).await?;
    captcha::Model::delete_one(db, &data.key).await?;

    if !is_valid {
        return Err(ServiceError::LogicError("验证码错误".to_owned()));
    }

    if let Some(user) = user {
        let digest = md5::compute(data.password.to_owned());
        if format!("{:x}", digest) == user.password {
            Ok(())
        } else {
            Err(ServiceError::LogicError("用户名或密码错误".to_owned()))
        }
    } else {
        Err(ServiceError::LogicError("用户名或密码错误".to_owned()))
    }
}
async fn check_login(db: &Database, data: &LoginPayload) -> Result<bool, ServiceError> {
    let cap = captcha::Model::find_one(db, captcha::Filter { key: Some(data.key.to_owned()) }).await?;
    if let Some(cap) = cap {
        Ok(cap.offset == data.offset)
    } else {
        Err(ServiceError::LogicError("验证码已过期".to_owned()))
    }
}
