pub mod logs;
pub mod captcha;
pub mod users;
pub mod apps;
pub mod source;
pub mod projects;

pub type QueryResult<T> = Result<T, QueryError>;
#[derive(Debug)]
pub enum QueryError {
    OidError(String),
    FindError(String),
}
impl From<mongodb::bson::oid::Error> for QueryError {
    fn from(err: mongodb::bson::oid::Error) -> Self {
        QueryError::OidError(err.to_string())
    }
}
impl From<mongodb::error::Error> for QueryError {
    fn from(err: mongodb::error::Error) -> Self {
        QueryError::FindError(err.to_string())
    }
}
