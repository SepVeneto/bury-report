use actix_web::{post, web, HttpResponse};
use mongodb::Database;
use crate::services::{ServiceError, Response};
use crate::services::source;
use crate::model::source::BasePayload;


pub fn init_service(config: &mut web::ServiceConfig) {
    // config.service(get_source);
    config.service(set_source);
}

// #[get("/source")]
// async fn get_source(
//     db: web::Data<Database>,
// ) -> ServiceResult {

// }

#[post("/source")]
async fn set_source(
    db: web::Data<Database>,
    json: web::Json<BasePayload<Option<String>>>,
) -> Result<HttpResponse, ServiceError> {
    let res = source::add(&db, json.0).await?;
    Response::ok(res).to_json()
}
