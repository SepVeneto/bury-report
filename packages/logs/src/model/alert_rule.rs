use serde::{Deserialize, Serialize};

use crate::model::{BaseModel, QueryModel};

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct NotifyFrequency {
    // 告警窗口，单位秒。也就是下一次会发送告警的时间
    pub window_sec: i64,
    // 告警阈值，即窗口期内到达阈值时，开始发送告警
    pub limit: i64,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct NotifySetting {
    pub url: String,
    pub frequency: NotifyFrequency,
}

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
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

pub struct RuleFilter {

}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub enum AlertSourceType {
    Collection,
    Fingerprint,
}
#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct AlertSourceWithCollection {
    r#type: AlertSourceType,
    pub log_type: CollectionType,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct AlertSourceWithFingerprint {
    r#type: AlertSourceType,
    pub fingerprint: String,
}
#[derive(Deserialize, Serialize, Clone, Debug)]
pub enum AlertSource {
    Collection(AlertSourceWithCollection),
    Fingerprint(AlertSourceWithFingerprint)
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct AlertNotifyWithOnce {
    pub url: String
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct AlertNotifyWithWindow {
    pub url: String,
    // 告警窗口，单位秒。也就是下一次会发送告警的时间
    pub window_sec: i64,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct AlertNotifyWithLimit {
    pub url: String,
    // 告警阈值，即窗口期内到达阈值时，开始发送告警
    pub limit: i64,
    // 节流窗口，单位秒。窗口时间内到达
    pub window_sec: i64,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub enum AlertNotify {
    Once(AlertNotifyWithOnce),
    Window(AlertNotifyWithWindow),
    Limit(AlertNotifyWithLimit),
}


#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Model {
  pub name: String,
  pub enabled: bool,
  pub strategy: AlertStrategy,
  pub source: AlertSource,
  pub notify: AlertNotify,
}

impl BaseModel for Model {
    const NAME: &'static str = "alert_rule";
    type Model = Model;
}

impl QueryModel for Model {}
