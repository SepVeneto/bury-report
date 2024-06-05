use super::{BaseModel, CreateModel, DeleteModel, PaginationModel};
use serde::{de::{self, Visitor}, Deserialize, Deserializer, Serialize, Serializer};
use serde_json::{Map, Value};
use chrono::{DateTime,Utc, NaiveDateTime};
use log::{error, info};

pub const NAME: &'static str = "records_api";

fn serialize_time<S>(time: &String, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer
{
    let naive = NaiveDateTime::parse_from_str(time, "%Y-%m-%d %H:%M:%S").unwrap();
    let chrono_datetime = DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc);
    let s = mongodb::bson::DateTime::from_chrono(chrono_datetime);

    Ok(serializer.serialize_struct(s, 1))
}

struct DateVisitor;
impl<'de> Visitor<'de> for DateVisitor {
    type Value = DateTime<Utc>;

    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
        formatter.write_str("a string representing a date and time")
    }
    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S")
            .map_err(E::custom)
            .map(|naive| DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc))
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Model {
  pub r#type: String,
  pub appid: String,
  pub data: Map<String, Value>,
  pub uuid: String,
  #[serde(serialize_with = "serialize_time", deserialize_with = "deserialize_time")]
  pub create_time: String,
}
pub fn deserialize_time<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
where
    D: Deserializer<'de>
{
    deserializer.deserialize_str(DateVisitor)
}

impl BaseModel for Model {
    const NAME: &'static str = NAME;
    type Model = Model;
}
impl CreateModel for Model {}
impl DeleteModel for Model {}
impl PaginationModel for Model {}
