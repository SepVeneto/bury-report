use mongodb::bson::oid;
use serde::Serializer;

pub fn _serialize_oid<S>(oid: &Option<oid::ObjectId>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&oid.unwrap().to_string())
}

pub fn serialize_from_oid<S>(oid: &oid::ObjectId, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&oid.to_hex())
}
