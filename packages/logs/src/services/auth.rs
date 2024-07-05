use actix_web::web;
use anyhow::anyhow;
use mongodb::{results::InsertOneResult, Database};
use md5;

use crate::model::{
    captcha,
    users::{Filter, LoginPayload, Model, RegisterPayload},
};

use super::ServiceResult;

pub async fn register(db: &web::Data<Database>, data: &RegisterPayload) -> ServiceResult<InsertOneResult> {
    let res = Model::find_one(db, Filter { name: Some(data.name.to_owned()) }).await?;
    if let Some(_) = res {
        return Err(anyhow!("用户已存在").into());
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
        return Err(anyhow!("验证码错误").into());
    }

    if let Some(user) = user {
        let digest = md5::compute(data.password.to_owned());
        if format!("{:x}", digest) == user.password {
            Ok(())
        } else {
            Err(anyhow!("用户名或密码错误").into())
        }
    } else {
        Err(anyhow!("用户名或密码错误").into())
    }
}
async fn check_login(db: &Database, data: &LoginPayload) -> ServiceResult<bool> {
    let cap = captcha::Model::find_one(db, captcha::Filter { key: Some(data.key.to_owned()) }).await?;
    if let Some(cap) = cap {
        Ok(cap.offset == data.offset)
    } else {
        Err(anyhow!("验证码已过期").into())
    }
}

// const L: u32 = 42;
// const R: u32 = 9;
// async fn gen_captcha() -> {
//     use image::io::Reader as ImageReader;

//     let img = ImageReader::open("../assets/976-310x155.jpg")?.decode()?;
// }
