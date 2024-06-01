use actix_web::web;
use mongodb::Database;

pub fn init_service(config: &mut web::ServiceConfig) {
}

pub async fn get_app_list(db: &Database) {
    
}
