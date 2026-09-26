//! 运行态探针：定期打点 FD / socket 状态 / RSS / Mongo 连接数 / 内存 map 条目数。
//!
//! 只读、不干预，用来在"FD 与内存只增不减"刚有苗头时就能发现。
//!   PROBE_INTERVAL_SECS    采样间隔，默认 30；0 = 关闭
//!   PROBE_CLOSE_WAIT_WARN  CLOSE_WAIT 超阈值升级为 WARN，默认 200

use std::collections::HashMap;
use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};

use bson::doc;
use log::{info, warn};
use mongodb::Client;
use tokio::time::{Duration, interval};

use crate::alert::model::{ALERT_MAP, SUMMARY_MAP};

static MONGO_STAT_WARNED: AtomicBool = AtomicBool::new(false);

fn env_u64(key: &str, default: u64) -> u64 {
    std::env::var(key).ok().and_then(|v| v.parse().ok()).unwrap_or(default)
}

pub async fn run(client: Client) {
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
        let stat = tokio::task::spawn_blocking(FdStat::collect).await.unwrap_or_default();
        let (rss_kb, threads) = mem_stat();
        let summaries: usize = SUMMARY_MAP.iter().map(|e| e.value().summaries.len()).sum();
        let facts: usize = ALERT_MAP.iter().map(|e| e.value().map.len()).sum();

        // 先输出本地指标：即使 Mongo 卡住，FD/RSS 采样也不会被拖住
        let line = format!(
            "probe fds={} sockets={} close_wait={} established={} time_wait={} other={} rss_kb={} threads={} summaries={} facts={}",
            stat.fds, stat.sockets, stat.close_wait, stat.established, stat.time_wait, stat.other,
            rss_kb, threads, summaries, facts
        );
        if stat.close_wait >= close_wait_warn {
            warn!("{} (ALERT: close_wait 超过阈值 {}，连接可能正在泄漏)", line, close_wait_warn);
        } else {
            info!("{}", line);
        }

        // Mongo 指标单独采集并限时，卡住时只丢这一行
        match tokio::time::timeout(Duration::from_secs(5), mongo_connections(&client)).await {
            Ok(Some((current, total))) => {
                info!("probe mongo current={} total_created={}", current, total)
            }
            Ok(None) => {}
            Err(_) => warn!("probe 采集 Mongo 连接数超时(5s)"),
        }
    }
}

async fn mongo_connections(client: &Client) -> Option<(i64, i64)> {
    let admin = client.database("admin");
    match admin.run_command(doc! { "serverStatus": 1 }, None).await {
        Ok(doc) => {
            let conns = doc.get_document("connections").ok()?;
            let get = |k: &str| conns.get_i64(k).or_else(|_| conns.get_i32(k).map(i64::from)).unwrap_or(0);
            Some((get("current"), get("totalCreated")))
        }
        Err(err) => {
            if !MONGO_STAT_WARNED.swap(true, Ordering::Relaxed) {
                warn!("probe 无法读取 Mongo serverStatus.connections（缺少权限？）: {}", err);
            }
            None
        }
    }
}

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
                    if let Some(inode) = target.strip_prefix("socket:[").and_then(|r| r.strip_suffix(']')) {
                        inodes.push(inode.to_string());
                    }
                }
            }
        }
        let states = tcp_states();
        let mut stat = FdStat { fds, sockets: inodes.len(), ..Default::default() };
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

fn tcp_states() -> HashMap<String, String> {
    let mut map = HashMap::new();
    for path in ["/proc/self/net/tcp", "/proc/self/net/tcp6"] {
        let content = match fs::read_to_string(path) {
            Ok(c) => c,
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

fn mem_stat() -> (u64, u64) {
    let mut rss_kb = 0u64;
    let mut threads = 0u64;
    if let Ok(content) = fs::read_to_string("/proc/self/status") {
        for line in content.lines() {
            if let Some(rest) = line.strip_prefix("VmRSS:") {
                rss_kb = rest.split_whitespace().next().and_then(|v| v.parse().ok()).unwrap_or(0);
            } else if let Some(rest) = line.strip_prefix("Threads:") {
                threads = rest.trim().parse().unwrap_or(0);
            }
        }
    }
    (rss_kb, threads)
}
