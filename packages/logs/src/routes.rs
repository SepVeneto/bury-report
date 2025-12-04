pub fn services(config: &mut actix_web::web::ServiceConfig) {
  crate::apis::record::init_service(config);
}
