pub fn services(config: &mut actix_web::web::ServiceConfig) {
  crate::apis::auth::init_service(config);
  crate::apis::record::init_service(config);
}
