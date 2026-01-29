use bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

use crate::{model::{BaseModel, QueryModel}, utils::{Token, TokenKind, cal_md5}};

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq, Eq, Hash)]
pub enum CollectionType {
    #[serde(rename = "error")]
    Error,
    #[serde(rename = "api")]
    Networ,
    #[serde(rename = "log")]
    Custom,
}
#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub enum AlertStrategy {
    Once,
    Window,
    Limit,
}
impl ToString for AlertStrategy {
    fn to_string(&self) -> String {
        match self {
            AlertStrategy::Once => "once",
            AlertStrategy::Window => "window",
            AlertStrategy::Limit => "limit",
        }.into()
    }

}


#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type", content = "value")]
pub enum PatternType {
    Literal(String),
    Number,
    Uuid,
}

impl PatternType {
    fn matches(&self, token: &Token) -> bool {
        match &self {
            PatternType::Literal(s) => token.raw == *s,
            PatternType::Number => token.kind == TokenKind::Number,
            PatternType::Uuid => token.kind == TokenKind::Uuid,
        }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Condition {
    pub kind: TokenKind,
    pub pattern: PatternType,
}

impl Condition {
    pub fn matches(&self, token: &Token) -> bool {
        self.pattern.matches(token)
    }
}


#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct GroupPattern {
    pub fp: String,
    pub condition: Vec<Condition>,
}
impl GroupPattern {
    pub fn new (id: ObjectId, list: Vec<PatternType>) -> Self {
        let id_str = id.to_hex();
        println!("id: {}, md5: {:?}", id_str, cal_md5(&id_str));
        GroupPattern {
            fp: cal_md5(&id_str),
            condition: list.iter().map(|item| {
                let pre_kind = match item {
                    PatternType::Literal(_) => TokenKind::Word,
                    PatternType::Number => TokenKind::Number,
                    PatternType::Uuid => TokenKind::Uuid,
                };
                Condition {
                    kind: pre_kind,
                    pattern: item.clone(),
                }
            }).collect(),
        }
    }

    pub fn is_match(&self, tokens: &Vec<Token>) -> bool {
        let conds = &self.condition;
        let mut pattern_idx = 0;

        for token in tokens {
            if pattern_idx == conds.len() {
                break; //匹配结束
            }

            let cond = &conds[pattern_idx];

            if cond.kind != token.kind {
                continue;
            }

            if cond.matches(token) {
                pattern_idx += 1;
            }
        }

        pattern_idx == conds.len()
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AlertSource {
    Collection {
        log_type: CollectionType,
    },
    Fingerprint {
        fingerprint: String,
    },
    ErrorType {
        text: String,
    },
    Group {
        condition: Vec<PatternType>,
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(tag = "strategy", rename_all = "camelCase")]
pub enum AlertNotify {
    Once {
        url: String
    },
    Window {
        url: String,
        // 告警窗口，单位秒。也就是下Once一次会发送告警的时间
        window_sec: i64,
    },
    Limit {
        url: String,
        // 告警阈值，即窗口期内到达阈值时，开始发送告警
        limit: i64,
        // 节流窗口，单位秒。窗口时间内到达
        window_sec: i64,
    },
}
impl AlertNotify {
    pub fn ttl(&self) -> Option<i64> {
        match *self {
            AlertNotify::Window { window_sec, .. }
            | AlertNotify::Limit { window_sec, .. } => Some(window_sec),
            _ => None,
        }
    }

    pub fn strategy(&self) -> AlertStrategy {
        match *self {
            AlertNotify::Once { .. } => AlertStrategy::Once,
            AlertNotify::Window { .. } => AlertStrategy::Window,
            AlertNotify::Limit { .. } => AlertStrategy::Limit,
        }
    }

    pub fn url(&self) -> String {
        match *self {
            AlertNotify::Once { ref url, .. }
            | AlertNotify::Window { ref url, .. }
            | AlertNotify::Limit { ref url, .. } => url,
        }.into()
    }
}

#[derive(Clone, Debug)]
pub struct CollectionRule  {
    pub name: String,
    pub enabled: bool,
    pub notify: AlertNotify,
    pub log_type: CollectionType,
}

#[derive(Clone, Debug)]
pub struct FingerprintRule {
    pub name: String,
    pub enabled: bool,
    pub notify: AlertNotify,
}

#[derive(Clone, Debug)]
pub struct TypeRule {
    pub name: String,
    pub enabled: bool,
    pub notify: AlertNotify,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Model {
  pub name: String,
  pub enabled: bool,
  pub source: AlertSource,
  pub notify: AlertNotify,
}

impl BaseModel for Model {
    const NAME: &'static str = "alert_rule";
    type Model = Model;
}

impl QueryModel for Model {}
