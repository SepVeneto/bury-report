pub mod logs;
pub mod captcha;
pub mod users;
pub mod apps;
pub mod source;
pub mod projects;
pub mod charts;
pub mod statistics;

pub type QueryResult<T> = Result<T, QueryError>;
#[derive(Debug)]
pub enum QueryError {
    OidError(String),
    FindError(String),
}
impl QueryError {
    pub fn to_string(&self) -> String {
        match self {
            QueryError::OidError(str) => str.to_owned(),
            QueryError::FindError(str) => str.to_owned(),
        }
    }
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
impl From<mongodb::bson::de::Error> for QueryError {
    fn from(err: mongodb::bson::de::Error) -> Self {
        QueryError::FindError(err.to_string())
    }
}
