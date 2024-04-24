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
#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct StatisticLine {
    pub date: String,
    pub output: String,
    pub sum: usize,
}
#[derive(Deserialize, Serialize, Clone,Debug)]
#[serde(untagged)]
pub enum DataType {
    Line(StatisticLine),
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
pub struct RuleLine {
    source: String,
    dimension: String,
    value: Option<Vec<String>>,
    range: Option<Vec<String>>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum Rule {
    Pie(RulePie),
    Line(RuleLine),
}

impl Rule {
    // 数据源
    pub fn get_source(&self) -> String {
        match self {
            Rule::Pie(pie) => pie.source.to_owned(),
            Rule::Line(line) => line.source.to_owned()
        }
    }
    pub fn get_dimension(&self) -> String {
        match self {
            Rule::Pie(pie) => pie.dimension.to_owned(),
            Rule::Line(line) => line.dimension.to_owned(),
        }
    }
    pub fn get_range(&self) -> Vec<String> {
        match self {
            Rule::Pie(_) => vec![],
            Rule::Line(line) => line.range.to_owned().unwrap_or(vec![]),
        }
    }
    pub fn get_value(&self) -> Vec<String> {
        match self {
            Rule::Pie(_) => vec![],
            Rule::Line(line) => line.value.to_owned().unwrap_or(vec![])
        }
    }
}