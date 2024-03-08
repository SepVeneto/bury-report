use super::ServiceResult;
use actix_web::{get, post, web};
use log::error;
use mongodb::{bson::doc, Database};
use crate::{config::{Response, BusinessError}, model::*};
use super::SourcePayload;


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
    json: web::Json<SourcePayload>
) -> ServiceResult {

    impl SourcePayload {
        pub fn insert() {
            ()
        }
    }

    let data = SourcePayload::from(json);
    // let col_source = source::Model::collection(&db);
    let operate = source::Operation::new(&db);
    operate.insert_one(doc! { "name": json.name });

    if let Some(id) = &data.id {
        return Err(BusinessError::ValidationError { field: String::from("id") })
    } else {
        let res = col_source
            .find_one(doc! { "name": data.name }, None).await;
        if let Ok(res) = res {
            Response::ok("").to_json()
        //     res.map
        //     if let Some(res) = res {
        //         Err(BusinessError::InternalError)
        //     } else {
        //         let res = db.collection("logs").insert_one(doc! { "name": &data.name }, None).await;
        //         match res {
        //             Ok(res) => {
        //                 Response::ok(res.inserted_id).to_json()
        //             },
        //             Err(err) => {
        //                 error!("add source failed: {}", err);
        //                 Err(BusinessError::InternalError)
        //             }
        //         }
        //     }
        } else {
            Err(BusinessError::InternalError)
        }
    }
    
}
