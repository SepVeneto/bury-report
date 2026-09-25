//! 运行态探针：定期把"连接/FD/内存"相关的关键指标打成一行日志。
//!
//! 目的：线上出现"FD 与内存只增不减"时能第一时间发现，并留下可用于定位的快照，
//! 而不是等到容器顶到 91%、功能全挂之后才发现。
//!
//! 环境变量：
//!   PROBE_INTERVAL_SECS   采样间隔，默认 30；设为 0 关闭探针
//!   PROBE_CLOSE_WAIT_WARN CLOSE_WAIT 超过该值升级为 WARN，默认 200

use std::collections::HashMap;
use std::fs;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use bson::doc;
use log::{info, warn};
use mongodb::Client;
use rdkafka::producer::{BaseProducer, Producer};
use tokio::time::{Duration, interval};

use crate::alert::model::{ALERT_MAP, SUMMARY_MAP};

static MONGO_STAT_WARNED: AtomicBool = AtomicBool::new(false);

fn env_u64(key: &str, default: u64) -> u64 {
    std::env::var(key).ok().and_then(|v| v.parse().ok()).unwrap_or(default)
}

pub async fn run(producer: Arc<BaseProducer>, client: Client) {
    let secs = env_u64("PROBE_INTERVAL_SECS", 30);
    if secs == 0 {
        info!("probe disabled (PROBE_INTERVAL_SECS=0)");
        return;
    }
    let close_wait_warn = env_u64("PROBE_CLOSE_WAIT_WARN", 200) as usize;
    info!("probe started: interval={}s close_wait_warn={}", secs, close_wait_warn);

    let mut ticker = interval(Duration::from_secs(secs));
    loop {
        ticker.tick().await;
        // FD 多的时候 readlink 会阻塞几十毫秒，放到阻塞线程池里，别占 tokio worker
        let stat = tokio::task::spawn_blocking(FdStat::collect)
            .await
            .unwrap_or_default();
        let (rss_kb, threads) = mem_stat();
        let summaries: usize = SUMMARY_MAP.iter().map(|e| e.value().summaries.len()).sum();
        let facts: usize = ALERT_MAP.iter().map(|e| e.value().map.len()).sum();
        let in_flight = producer.in_flight_count();

        let line = format!(
            "probe fds={} sockets={} close_wait={} established={} time_wait={} other={} \
             rss_kb={} threads={} summaries={} facts={} kafka_inflight={}",
            stat.fds,
            stat.sockets,
            stat.close_wait,
            stat.established,
            stat.time_wait,
            stat.other,
            rss_kb,
            threads,
            summaries,
            facts,
            in_flight,
        );

        // Mongo 连接数：需要 serverStatus 权限；没权限只提示一次，不影响主流程
        let mongo = match mongo_connections(&client).await {
            Some((current, total_created, active)) => {
                format!(" mongo_current={} mongo_total_created={} mongo_active={}", current, total_created, active)
            }
            None => String::new(),
        };

        if stat.close_wait >= close_wait_warn {
            warn!(
                "{} {} (ALERT: close_wait 超过阈值 {}，连接可能正在泄漏)",
                line, mongo, close_wait_warn
            );
        } else {
            info!("{}{}", line, mongo);
        }
    }
}

async fn mongo_connections(client: &Client) -> Option<(i64, i64, i64)> {
    let admin = client.database("admin");
    match admin.run_command(doc! { "serverStatus": 1 }, None).await {
        Ok(doc) => {
            let conns = doc.get_document("connections").ok()?;
            let get = |key: &str| conns.get_i64(key).or_else(|_| conns.get_i32(key).map(i64::from)).unwrap_or(0);
            Some((get("current"), get("totalCreated"), get("active")))
        }
        Err(err) => {
            if !MONGO_STAT_WARNED.swap(true, Ordering::Relaxed) {
                warn!("probe 无法读取 Mongo serverStatus.connections（缺少权限？）: {}", err);
            }
            None
        }
    }
}

/// 本进程的 FD 与 TCP 状态统计（只看本进程持有的 socket）
#[derive(Default)]
struct FdStat {
    fds: usize,
    sockets: usize,
    close_wait: usize,
    established: usize,
    time_wait: usize,
    other: usize,
}

impl FdStat {
    fn collect() -> Self {
        let mut fds = 0usize;
        let mut inodes: Vec<String> = Vec::new();
        if let Ok(entries) = fs::read_dir("/proc/self/fd") {
            for entry in entries.flatten() {
                fds += 1;
                if let Ok(target) = fs::read_link(entry.path()) {
                    let target = target.to_string_lossy();
                    if let Some(inode) = target
                        .strip_prefix("socket:[")
                        .and_then(|rest| rest.strip_suffix(']'))
                    {
                        inodes.push(inode.to_string());
                    }
                }
            }
        }

        let states = tcp_states();
        let mut stat = FdStat {
            fds,
            sockets: inodes.len(),
            close_wait: 0,
            established: 0,
            time_wait: 0,
            other: 0,
        };
        for inode in &inodes {
            match states.get(inode).map(String::as_str) {
                Some("08") => stat.close_wait += 1,
                Some("01") => stat.established += 1,
                Some("06") => stat.time_wait += 1,
                _ => stat.other += 1,
            }
        }
        stat
    }
}

/// /proc/self/net/tcp{,6} 里的 inode -> 状态码
fn tcp_states() -> HashMap<String, String> {
    let mut map = HashMap::new();
    for path in ["/proc/self/net/tcp", "/proc/self/net/tcp6"] {
        let content = match fs::read_to_string(path) {
            Ok(content) => content,
            Err(_) => continue,
        };
        for line in content.lines().skip(1) {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() > 9 {
                map.insert(fields[9].to_string(), fields[3].to_string());
            }
        }
    }
    map
}

/// /proc/self/status 里的 VmRSS 与线程数
fn mem_stat() -> (u64, u64) {
    let mut rss_kb = 0u64;
    let mut threads = 0u64;
    if let Ok(content) = fs::read_to_string("/proc/self/status") {
        for line in content.lines() {
            if let Some(rest) = line.strip_prefix("VmRSS:") {
                rss_kb = rest
                    .split_whitespace()
                    .next()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(0);
            } else if let Some(rest) = line.strip_prefix("Threads:") {
                threads = rest
                    .trim()
                    .parse()
                    .unwrap_or(0);
            }
        }
    }
    (rss_kb, threads)
}
