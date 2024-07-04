use futures_util::StreamExt;
use bson::{oid::ObjectId, Document};
use log::info;
use mongodb::{bson::{doc, oid}, Database};
use serde::{Deserialize, Serialize, Serializer};
use crate::{config::serialize_oid, utils::{array_to_tree, LikeNode, TreeList}};

use super::{BaseModel, CreateModel, DeleteModel, EditModel, PaginationModel, QueryBase, QueryModel, QueryResult};

pub const NAME: &str = "source";

// #[derive(Deserialize, Serialize, Clone, Debug)]
// pub struct BasePayload {
//     pub pid: Option<String>,
//     pub name: String,
//     pub value: String,
// }

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

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Model {
    pub name: String,
    pub value: String,
    #[serde(serialize_with = "serialize_id_to_hex")]
    pub pid: Option<ObjectId>,
    // pub appid: String,
    // pub level: u32,
    // pub children: Vec<Model>,
}
pub type BasePayload = Model;

fn serialize_id_to_hex<S: Serializer>(
    val: &Option<ObjectId>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    if let Some(val) = val {
        let res = val.to_hex();
        serializer.serialize_str(&res)
    } else {
        serializer.serialize_none()
    }
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

#[derive(Deserialize, Serialize, Debug)]
pub struct TreeModel {
    #[serde(flatten)]
    base: QueryBase<Model>,
    children: Vec<Model>,
}

type Node = QueryBase<Model>;

impl LikeNode for Node {
    fn id(&self) -> ObjectId {
        self._id
    }
    fn pid(&self) -> Option<ObjectId> {
        self.model.pid
    }
}

impl Model {
    pub async fn find_all_as_tree(
        db: &Database,
        filter: impl Into<Option<Document>>
    ) -> QueryResult<TreeList<QueryBase<Self>>> {
        let col = db.collection::<QueryBase<Self>>(Self::NAME);
        let mut list = vec![];
        let mut cursor = col.find(filter, None).await?;

        while let Some(res) = cursor.next().await {
            list.push(res?)
        }

        let tree = array_to_tree(list);
        Ok(tree)
    }
}

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
