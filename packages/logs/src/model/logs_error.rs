use super::{BaseModel, CreateModel, DeleteModel};
use serde::{Deserialize, Serialize, Serializer};
use serde_json::{Map, Value};
use mongodb::bson::DateTime;
use log::error;

pub const NAME: &'static str = "records_err";

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Model {
  pub r#type: String,
  pub appid: String,
  pub data: Map<String, Value>,
  pub uuid: String,
  #[serde(serialize_with = "serialize_time")]
  pub create_time: DateTime,
}
pub fn serialize_time<S>(time: &DateTime, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer
{
    match time.try_to_rfc3339_string() {
        Ok(time_str) => {
            match chrono::DateTime::parse_from_rfc3339(&time_str) {
                Ok(res) => {
                    let fmt_str = res.format("%Y-%m-%d %H:%M:%S");
                    serializer.serialize_str(&format!("{}", fmt_str))
                },
                Err(err) => {
                    error!("{:?}", err);
                    serializer.serialize_none()
                }
            }
        },
        Err(err) => {
            error!("{:?}", err);
            serializer.serialize_none()
        }
    }

}

impl BaseModel for Model {
    const NAME: &'static str = NAME;
    type Model = Model;
}
impl CreateModel for Model {}
impl DeleteModel for Model {}
