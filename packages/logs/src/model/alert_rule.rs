use serde::{Deserialize, Serialize};

use crate::model::{BaseModel, QueryModel};

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
