use mongodb::bson::{doc, oid};
use serde::{Deserialize, Serialize};
use crate::config::serialize_oid;

use super::{BaseModel, CreateModel, DeleteModel, EditModel, PaginationModel, QueryModel};

pub const NAME: &str = "source";

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct BasePayload {
    pub pid: Option<String>,
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<oid::ObjectId>,
    #[serde(skip_deserializing)]
    pub appid: String,
    pub level: u32,
    pub name: String,
    pub value: String,
}

impl BasePayload {
    pub fn set_appid(&mut self, appid: &str) -> () {
        self.appid = appid.to_string();
    }
}

#[derive(Deserialize, Serialize, Clone)]
pub struct QueryPayload {
    pub page: u64,
    pub size: u64,
    #[serde(skip_deserializing)]
    pub appid: String,
}

impl QueryPayload {
    pub fn set_appid(&mut self, appid: &str) -> () {
        self.appid = appid.to_string();
    }
}

#[derive(Deserialize, Serialize, Debug)]
pub struct Model {
    pub name: String,
    pub value: String,
    pub appid: String,
    pub level: u32,
    pub children: Vec<Model>,
    #[serde(
        serialize_with = "serialize_oid",
        rename(serialize = "id"),
        skip_serializing_if = "Option::is_none"
    )]
    pub _id: Option<oid::ObjectId>,
}

impl BaseModel for Model {
    const NAME: &'static str = NAME;
    type Model = Model;
}
impl QueryModel for Model {}
impl CreateModel for Model {}
impl EditModel for Model {}
impl PaginationModel for Model {}
impl DeleteModel for Model {}

// impl Model {
//     pub fn col (db: &Database) -> Collection<Self> {
//         db.collection(NAME)
//     }
//     pub async fn find_by_id(db: &Database, id: &str) -> QueryResult<Option<Self>> {
//         let oid = oid::ObjectId::from_str(id)?;
//         let options = FindOneOptions::builder()
//             .projection(Some(doc! { "id": "$_id", "name": 1, "value": 1, "appid": 1, "level": 1 }))
//             .build();
//         Ok(Self::col(db).find_one(doc! {"_id": oid }, options).await?)
//     }
//     pub async fn insert(db: &Database, data: &BasePayload) -> QueryResult<InsertOneResult> {
//         let new_doc = Model {
//             _id: None,
//             name: data.name.to_string(),
//             value: data.value.to_string(),
//             appid: data.appid.to_string(),
//             children: vec![],
//             level: 1,
//         };
//         info!("{:?}", new_doc);
//         Ok(Self::col(db).insert_one(new_doc, None).await?)
//     }
//     pub async fn find_one(db: &Database, data: Filter) -> QueryResult<Option<Self>> {
//         let mut query = doc! {
//             "appid": data.appid,
//         };
//         if let Some(name) = data.name {
//             query.insert("name", name);
//         }
//         if let Some(value) = data.value {
//             query.insert("value", value);
//         }

//         Ok(Self::col(db).find_one(query, None).await?)
//     }
//     pub async fn delete_one(db: &Database, id: &str) -> QueryResult<DeleteResult> {
//         let oid = oid::ObjectId::parse_str(id)?;
//         Ok(Self::col(db).delete_one(doc! { "_id": oid }, None).await?)
//     }
//     pub async fn update_one(db: &Database, id: &oid::ObjectId, data: &BasePayload) -> QueryResult<UpdateResult> {
//         let filter = doc! { "_id": id };
//         let new_doc = doc! {
//             "$set": {
//                 "name": data.name.to_string(),
//                 "value": data.value.to_string(),
//             }
//         };
//         let res = Self::col(db)
//             .update_one(filter, new_doc, None)
//             .await?;
//         Ok(res)
//     }
//     pub async fn find_many(db: &Database, appid: &str) -> QueryResult<Vec<Model>>{
//         let mut list = vec![];
//         let mut res = Self::col(db).find(doc! {
//             "appid": appid.to_string(),
//         }, None).await.unwrap();
//         while let Some(record) = res.next().await {
//             list.push(record.unwrap())
//         }
//         Ok(list)
//     }
// }
