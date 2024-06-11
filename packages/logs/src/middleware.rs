use std::future::{Ready, ready};
use actix_web::{
    body::EitherBody,
    dev::{forward_ready, ServiceRequest, ServiceResponse, Transform, Service}, Error, HttpResponse
};
use futures_util::future::LocalBoxFuture;

pub struct Auth;

impl <S, B> Transform<S, ServiceRequest> for Auth
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type InitError = ();
    type Transform = AuthMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(AuthMiddleware { service }))
    }
}

pub struct AuthMiddleware<S> {
    service: S,
}

const AUTH_WHITELIST: [&str; 3] = ["/record", "/login", "/register"];
impl<S, B> Service<ServiceRequest> for AuthMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;


    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {

        let path = req.path();
        if AUTH_WHITELIST.contains(&path) {
            let res = self.service.call(req);
            return Box::pin(async move {
                res.await.map(ServiceResponse::map_into_left_body)
            });
        }
        if let None = req.headers().get("Authorization") {
            let (req, _pl) = req.into_parts();
            let res = HttpResponse::Forbidden()
                .finish()
                .map_into_right_body();
            return Box::pin(async {
                Ok(ServiceResponse::new(req, res))
            });
        }

        let res = self.service.call(req);
        Box::pin(async move {
            res.await.map(ServiceResponse::map_into_left_body)
        })
    }
}