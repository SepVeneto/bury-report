use log::{info, error};
use rdkafka::{ClientConfig, Message};
use rdkafka::consumer::{Consumer, StreamConsumer};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};



#[derive(Deserialize, Serialize, Debug)]
struct Notify {
  url: String,
  name: String,
  page: String,
  r#type: String,
  rule: Map<String, Value>,
  fact: Map<String, Value>,
  content: String
}

impl Notify {
  fn tmpl(&self) -> Option<String> {
    let strategy = self.rule.get("strategy");
    let fp = get_string(&self.fact, "fingerprint", "unknown");
    if let Some(strategy) = strategy {
      match strategy.as_str() {
        Some("once") => {
            let content = format!(
              "<font color=\"warning\">错误告警</font>\n**规则名称**：{name}\n**指纹**: {fp}\n**摘要**：\n> {summary}\n\n**触发位置**: {page}\n**触发条件**：周期内首次触发",
              name = self.name,
              fp = fp,
              page = self.page,
              summary = self.content,
            );
            Some(content)
        },
        Some("window") => {
          let window_sec = time_human_readable(get_number(&self.rule, "window_sec"));
          let content = format!(
            "<font color=\"warning\">错误告警</font>\n**规则名称**：{name}\n**指纹**: {fp}\n**摘要**：\n> {summary}\n\n**触发位置**: {page}\n**触发条件**：{period}/次",
            name = self.name,
            fp = fp,
            summary = self.content,
            page = self.page,
            period = window_sec,
          );
          Some(content)
        },
        Some("limit") => {
          let window_sec = time_human_readable(get_number(&self.rule, "window_sec"));
          let limit = get_number(&self.rule, "limit");
          let content = format!(
            "<font color=\"warning\">错误告警</font>\n**规则名称**：{name}\n**指纹**: {fp}\n**摘要**：\n> {summary}\n\n**触发位置**: {page}\n**触发条件**：{period}内已累计触发{limit}次",
            name = self.name,
            fp = fp,
            summary = self.content,
            page = self.page,
            period = window_sec,
          );
          Some(content)
        },
        _ => None
      }
    } else {
      None
    }
  }
}


pub async fn init_notify() {
  info!("foo");
  let brokers = std::env::var("KAFKA_BROKERS").expect("enviroment missing KAFKA_BROKERS");
  let consumer: StreamConsumer = ClientConfig::new()
    .set("bootstrap.servers", brokers)
    .set("group.id", "bury-report-notify")
    .set("enable.partition.eof", "false")
    .set("session.timeout.ms", "6000")
    .set("enable.auto.commit", "true")
    .create()
    .expect("Consumer creation failed");

  consumer.subscribe(&["notify"]).expect("notify subscribe failed");
  info!("notify consumer started...");
  let mut message_stream = consumer.stream();
  while let Some(message) = message_stream.next().await {
    match message {
      Ok(m) => {
        match m.payload_view() {
          Some(Ok(message)) => {
            let m = match serde_json::from_slice::<Notify>(message) {
              Ok(m) => m,
              Err(e) => {
                error!("Error while parsing message: {}", e);
                continue;
              }
            };
            if let Some(content) = m.tmpl() {
              info!("data: {:?}", m);
              info!("content: {}", content);
              tokio::spawn(async move {
                send_notify_to_wxwork(&m.url, &content).await;
              });
            } else {
              error!("No template found");
            }
          }
          Some(Err(e)) => {
            error!("Error while parsing message payload: {:?}", e);
          }
          None => {
            error!("Message payload is None");
          }
        }
      },
      Err(e) => {
        error!("Error while receiving message: {}", e);
      }
    }
  }
}

async fn send_notify_to_wxwork(url: &str, content: &str) {
  let client = reqwest::Client::new();
  let data = json!({
    "msgtype": "markdown",
    "markdown": {
      "content": content
    }
  });
  let res = client
    .post(url)
    .json(&data)
    .send().await;
  info!("send notify to wxwork: {:?}", res)
}

fn get_string(map: &Map<String, Value>, key: &str, default: &str) -> String {
    map.get(key)
       .and_then(|v| v.as_str())
       .unwrap_or(default)
       .to_string()
}

fn get_number(map: &Map<String, Value>, key: &str) -> i64 {
    map.get(key)
       .and_then(|v| v.as_i64())
       .unwrap_or(0)
}

fn time_human_readable(sec: i64) -> String {
  if sec < 0 {
    return "0秒".to_string();
  }

  let hours = (sec % (60 * 60 * 24)) / (60 * 60);
  let minutes = (sec % (60 * 60)) / 60;
  let seconds = sec % 60;

  let mut parts = Vec::new();
  if hours > 0 {
    parts.push(format!("{}小时", hours));
  }
  if minutes > 0 {
    parts.push(format!("{}分", minutes));
  }
  if seconds > 0 || parts.is_empty() {
    parts.push(format!("{}秒", seconds));
  }

  parts.join("")
}
