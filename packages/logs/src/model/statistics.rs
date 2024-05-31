use std::str::FromStr;
use crate::config::serialize_oid;

use futures_util::StreamExt;
use mongodb::{
    bson::{doc, oid, to_bson},
    results::InsertOneResult, Collection, Database
};
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
    pub name: String,
    pub value: usize,
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

#[derive(Deserialize, Serialize, Debug)]
pub struct Model {
    #[serde(
        serialize_with = "serialize_oid",
        rename(serialize = "id"),
        skip_serializing_if = "Option::is_none"
    )]
    _id: Option<oid::ObjectId>,
    pub appid: String,
    r#type: String,
    pub data: Rule,
    #[serde(skip_serializing)]
    pub cache: Vec<DataType>
}

impl Model {
    pub fn col (db: &Database) -> Collection<Self> {
        db.collection(NAME)
    }
    pub async fn insert_pie(
        db: &Database,
        chart_type: &str,
        appid: &str,
        data: Rule,
        cache: Vec<DataType>,
    ) -> QueryResult<InsertOneResult> {
        let new_doc = Model {
            _id: None,
            r#type: chart_type.to_string(),
            appid: appid.to_string(),
            data,
            cache,
        };
        Ok(Self::col(db).insert_one(new_doc, None).await?)
    }
    pub async fn find_many(db: &Database, appid: &str) -> QueryResult<Vec<Model>> {
        let mut list = vec![];
        let mut res = Self::col(db).find(doc! {
            "appid": appid,
        }, None).await?;
        while let Some(record) = res.next().await {
            list.push(record?)
        }
        Ok(list)
    }
    pub async fn find_by_id(db: &Database, id: &str) -> QueryResult<Option<Model>> {
        let oid = oid::ObjectId::from_str(id)?;
        let res = Self::col(db).find_one(doc! {
            "_id": oid
        }, None).await?;
        Ok(res)
    }
    pub async fn update_one(
        db: &Database,
        statistic_id: &str,
        data: Rule,
        cache: Vec<DataType>
    ) -> QueryResult<()> {
        let query = doc! {
            "_id": oid::ObjectId::from_str(statistic_id)?,
        };
        let new_doc = doc! {
            "$set": {
                "data": to_bson(&data)?,
                "cache": to_bson(&cache)?
            }
        };
        Self::col(db).update_one(query, new_doc, None).await?;
        Ok(())
    }

    pub async fn delete_one(
        db: &Database,
        statistic_id: &str,
    ) -> QueryResult<()> {
        let query = doc! {
            "_id": oid::ObjectId::from_str(statistic_id)?
        };
        Self::col(db).delete_one(query, None).await?;
        Ok(())
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct RulePie {
    name: String,
    source: String,
    dimension: String,
    sort: String,
}
#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct RuleLine {
    name: String,
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

    pub fn get_sort(&self) -> String {
        match self {
            Rule::Pie(pie) => pie.sort.to_owned(),
            Rule::Line(_line) => String::from(""),
        }
    }
}