use mongodb::{
    bson::oid::ObjectId, Database, Collection,
    results::InsertOneResult,
};
use serde_json::Value;
use serde::{Deserialize, Serialize};

use super::QueryResult;

pub const NAME: &str = "statistics";

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct StatisticTotal {
    pub log_type: String,
    pub count: usize,
}
#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct StatisticPie {
    pub output: String,
    pub sum: usize,
}
#[derive(Deserialize, Serialize, Clone,Debug)]
#[serde(untagged)]
pub enum DataType {
    Total(StatisticTotal),
    Pie(StatisticPie),
}

#[derive(Deserialize, Serialize)]
pub struct Model {
    _id: Option<ObjectId>,
    appid: String,
    r#type: String,
    data: DataType,
}
pub struct Payload {
    appid: String,
    r#type: String,
    data: DataType,
}

impl Model {
    pub fn col (db: &Database) -> Collection<Self> {
        db.collection(NAME)
    }
    pub async fn insert(db: &Database, data: &Payload) -> QueryResult<InsertOneResult> {
        let new_doc = Model {
            _id: None,
            r#type: data.r#type.to_string(),
            appid: data.appid.to_string(),
            data: data.data.clone(),
        };
        Ok(Self::col(db).insert_one(new_doc, None).await?)
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct RulePie {
    source: String,
    dimension: String
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum Rule {
    Pie(RulePie)
}

impl Rule {
    // 数据源
    pub fn get_source(&self) -> String {
        match self {
            Rule::Pie(pie) => pie.source.to_owned()
        }
    }
    pub fn get_dimension(&self) -> String {
        match self {
            Rule::Pie(pie) => pie.dimension.to_owned()
        }
    }
}