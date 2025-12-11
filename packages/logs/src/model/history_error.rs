use lazy_static::lazy_static;
use regex::Regex;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct HistoryError {
    fingerprint: String,
}

#[derive(Clone, Debug)]
pub struct ErrorInfo {
    pub name: String,
    pub message: String,
    pub stack: String,
    pub extra: Option<Value>,
    pub page: Option<Value>,
}
impl ErrorInfo {
    pub fn clean(&mut self) {
        lazy_static! {
            static ref LINE_COL_RE: Regex = Regex::new(r":\d+:\d+").unwrap();
            static ref QUERY_RE: Regex = Regex::new(r"(\?.*?)(?=\)|$)").unwrap();
        }
        self.message = self.message.trim().into();
        self.stack = LINE_COL_RE.replace_all(&self.stack, ":{line}:{col}").to_string();
        self.stack = QUERY_RE.replace_all(&self.stack, "?{query}").to_string();
    }
    pub fn summary(&self) -> String {
        format!("{} {}", self.message, self.stack)
    }
}
