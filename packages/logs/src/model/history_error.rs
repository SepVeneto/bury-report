use lazy_static::lazy_static;
use regex::Regex;
use md5;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::model::{BaseModel, CreateModel};

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Model {
    pub fingerprint: String,
    pub summary: String,
    pub name: String,
    pub message: String,
    pub stack: String,
    pub extra: Option<Value>,
    pub page: Option<Value>,
}

impl Model {
    pub fn clean(&mut self) {
        lazy_static! {
            static ref LINE_COL_RE: Regex = Regex::new(r":\d+:\d+").unwrap();
            static ref QUERY_RE: Regex = Regex::new(r"\?[^)]*").unwrap();
        }
        self.message = self.message.trim().into();
        self.stack = LINE_COL_RE.replace_all(&self.stack, ":{line}:{col}").to_string();
        self.stack = QUERY_RE.replace_all(&self.stack, "?{query}").to_string();
    }
    // 标准化后生成指纹
    pub fn summary(&mut self) -> String {
        self.clean();
        let str = format!("{} {}", self.message, self.stack);
        self.fingerprint = Some(cal_md5(&str));
        str
    }
}

impl BaseModel for Model {
    const NAME: &'static str = "history_error";
    type Model = Model;
}
impl CreateModel for Model {}

fn cal_md5(res: &str) -> String {
  let digest = md5::compute(res.as_bytes());

  format!("{:x}", digest).to_uppercase()
}
