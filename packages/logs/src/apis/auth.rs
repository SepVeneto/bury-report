use actix_web::{web, post};
use log::error;
use mongodb::{Database, bson::doc};
use crate::config::{BusinessError, Response};
use super::{LoginPayload, RegisterPayload};
use crate::model;
use md5;
use super::ServiceResult;


const COLL_NAME: &str = "users";

pub fn init_service(config: &mut actix_web::web::ServiceConfig) {
  config.service(register);
  config.service(login);
}

#[post("/register")]
async fn register(db: web::Data<Database>, json: web::Json<RegisterPayload>) -> ServiceResult {
  
  let collection = db.collection::<model::User>(COLL_NAME);

  {
    let result = collection
      .find_one(doc! {"name": &json.name}, None).await.unwrap();

      if let Some(res) = result {
        let tips = format!("user {} exist", res.name);
        return Response::ok(tips).to_json();
      }
  }

  {
    let digest = md5::compute(json.password.to_owned());
    let new_user = model::User {
      name: json.name.to_owned(),
      password: format!("{:x}", digest),
    };
    let result = collection.insert_one(new_user, None).await;
    match result {
      Ok(_) => Response::ok("user added").to_json(),
      Err(err) => {
        error!("error {}", err);
        Err(BusinessError::InternalError)
      }
    }
  }
}

#[post("/login")]
async fn login(db: web::Data<Database>, json: web::Json<LoginPayload>) -> ServiceResult {
  let captcha = db.collection::<model::Captcha>("captcha");

  {
    let find_res = captcha.find_one(doc! { "key": json.key.to_owned() }, None).await.unwrap();
    if let Some(_res) = find_res {
      return Response::err(1002, "验证码已过期").to_json();
    }
  }

  let _ = captcha.delete_one(doc! { "key": json.key.to_owned()}, None).await;

  let user = db.collection::<model::User>("users");
  {
    let digest = md5::compute(json.password.to_owned());
    let filter = doc! {
      "password": format!("{:x}", digest),
      "name": json.name.to_owned(),
    };
    let find_res = user.find_one(filter, None).await;
    match find_res {
      Ok(find_res) => {
        if let Some(_) = find_res {
          Response::ok("1").to_json()
        } else {
          Response::err(1001, "用户名或密码错误").to_json()
        }
      },
      Err(err) => {
        error!("error: {}", err);
        Err(BusinessError::InternalError)
      }
    }
  }
}
