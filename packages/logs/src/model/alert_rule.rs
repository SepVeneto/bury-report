use serde::{Deserialize, Serialize};

use crate::model::{BaseModel, QueryModel};

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct NotifyFrequency {
    // 告警窗口，单位秒。也就是下一次会发送告警的时间
    pub window_sec: i64,
    // 窗口期内最大告警次数
    pub max_alerts: i64,
    // 告警阈值，即窗口期内到达阈值时，开始发送告警
    pub limit: i64,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct NotifySetting {
    pub enabled: bool,
    pub frequency: NotifyFrequency,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub enum AlertType {
    Error,
    Networ,
    Custom,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Model {
    name: String,
    enabled: bool,
    // 告警类型，错误触发，接口超时，自定义日志主动告警
    log_type: AlertType,
    // 指纹控制，启用后相同错误仅告警一次
    fingerprint: bool,
    notify: NotifySetting,
}

impl BaseModel for Model {
    const NAME: &'static str = "alert_rule";
    type Model = Model;
}

impl QueryModel for Model {}
