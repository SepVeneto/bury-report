# report-logs 本地测试环境

用于把 `packages/logs/TEST_CASES.md` 里的用例跑起来。**只依赖 MongoDB 与 Kafka(Redpanda)**，两个都用 docker 起在测试端口上，不和开发/线上环境冲突。

## 需要起什么服务

| 服务 | 镜像 | 测试端口 | 用途 |
|---|---|---|---|
| MongoDB | `mongo:4.4.26` | `127.0.0.1:27018` | 数据落库、`history_error`/`alert_fact` 聚合 |
| Kafka | `docker.redpanda.com/redpandadata/redpanda:v25.2.11` | `127.0.0.1:19093` | `rrweb`（会话数据）、`notify`（告警通知） |

不需要 Redis（那是 `packages/worker` 的依赖），也不需要 server/web/manage。

被测服务直接跑本机编译出来的 release 二进制（不是容器），这样可以读 `/proc/<pid>` 观测 FD 与 socket 状态——这正是回归本次事故的关键指标。

## 快速开始

```bash
# 0. 编译被测服务（首次约 1-2 分钟，增量 10 秒级）
cd packages/logs && cargo build --release && cd ../..

# 1. 起依赖 + 准备测试数据（app 记录、低权限账号）
scripts/logs-test/up.sh

# 2. 启动被测服务（日志在 /tmp/logs-test/service.log）
scripts/logs-test/service.sh start

# 3. 跑用例
scripts/logs-test/run-all.sh                    # A/B/C/D 组
RUN_FAULTS=1 scripts/logs-test/run-all.sh       # 追加：依赖故障注入
RUN_NFR=1    scripts/logs-test/run-all.sh       # 追加：压测 + FD/连接观测
RUN_FAULTS=1 RUN_NFR=1 scripts/logs-test/run-all.sh   # 全量

# 4. 收尾（停服务 + 删容器与数据）
scripts/logs-test/down.sh
```

常用命令：

```bash
scripts/logs-test/service.sh status|logs|restart|truncate-log
bash scripts/logs-test/cases/01_api.sh          # 单独跑某一组
docker exec -i logs-test-mongo mongo --quiet \
  "mongodb://root:root_123@127.0.0.1:27017/?authSource=admin" --eval 'db.getSiblingDB("app_64b7f0c2a1b2c3d4e5f60001").history_error.find().limit(1)'
docker exec -i logs-test-redpanda rpk topic consume notify --offset start
```

## 目录结构

| 文件 | 说明 |
|---|---|
| `docker-compose.yaml` | 测试依赖（mongo + redpanda） |
| `lib.sh` | 公共变量、断言、Mongo/HTTP/Kafka 封装 |
| `fdstat.py` | 统计进程的 FD / socket / TCP 状态（回归指标） |
| `up.sh` / `down.sh` | 起停依赖与数据准备/清理 |
| `service.sh` | 被测服务的启动/停止/重启/日志 |
| `cases/01_api.sh` | A 组：接口与协议 |
| `cases/02_ingest.sh` | B 组：上报类型 → 落库/转发 |
| `cases/03_alert.sh` | C 组：规则、指纹、通知 |
| `cases/04_flush.sh` | D 组：聚合与 10s flush |
| `cases/05_faults.sh` | E 组：故障注入（真实停 Mongo/Kafka、复现 GC 死掉与 init 静默失败） |
| `cases/06_nfr.sh` | F 组：压测 + FD/CLOSE_WAIT/Mongo 连接池观测 |
| `cases/07_matrix.sh` | 覆盖补齐：接口/上报/告警/聚合里的边界分支 |

## 运行态探针（线上排查用）

服务内置了一个轻量探针，每 30 秒打一行日志，用来抓"FD/连接只增不减"这类问题：

```bash
# 关闭
PROBE_INTERVAL_SECS=0
# 调整采样间隔与 CLOSE_WAIT 告警阈值
PROBE_INTERVAL_SECS=10 PROBE_CLOSE_WAIT_WARN=100
```

输出示例：

```
probe fds=95 sockets=34 close_wait=0 established=14 time_wait=0 other=20 rss_kb=18476 threads=21 \
      summaries=0 facts=12 kafka_inflight=0 mongo_current=13 mongo_total_created=424 mongo_active=2
```

排查时的判读：

* `close_wait` 持续上涨且 `mongo_total_created` 不再增长 ⇒ 本端滞留了对端已关闭的 socket（线上事故的形态）；
* `fds` 涨而 `mongo_current` 不涨 ⇒ FD 泄漏点在驱动/运行时，而不是业务逻辑；
* `rss_kb` 涨而 `summaries/facts` 不涨 ⇒ 内存不是被聚合 map 吃掉的（更可能是分配器高水位或其它结构）；
* `close_wait` 超阈值会输出 WARN + `ALERT`，可直接对日志做告警规则。
| `run-all.sh` | 一键入口 |

`lib.sh` 里区分三种结果：`PASS`/`FAIL` 是断言结果；已经确认是产品缺陷、但当前断言的是"现状"的用例输出 `WARN`（计入 `known-issue`，不会让套件变红，修复后自动变 `PASS`）；需要外部条件（长稳、大量历史数据）的用例输出 `SKIP`。

## 两个高价值复现用例

`RUN_FAULTS=1` 会额外做两件事，都是本次线上问题的最小复现：

1. **E03：flush 循环被 panic 打死。** 先持续上报让 `SUMMARY_MAP` 非空，再停掉 Mongo，让 `collect_summary` 的 `.unwrap()` 触发 panic。之后验证：
   - 日志出现 `panicked`
   - `/record` 仍返回成功、`records_err` 照常写入
   - 但 `history_error` **永久停写**（内存不再回收，正是线上"内存只涨不降 + 入库失灵"的形态）
   - `service.sh restart` 后恢复 → 证明"重启就好、但代码缺陷仍在"

2. **E12：`alert::init` 静默失败。** 在 Mongo 不可达时启动服务（客户端是懒连接不会 panic，`list_database_names` 超时返回 Err 被 `let _ =` 吞掉），验证：
   - 启动日志里**没有** `告警规则初始化完成`
   - 上报、落库都正常
   - 但 `history_error` 永远为空 → flush 循环从未被 spawn

`RUN_NFR=1` 的压测会把本次事故的核心指标量化：socket FD 增量、CLOSE_WAIT 增量、Mongo `connections.current/totalCreated`、RSS。阈值当前设为 socket +300、CLOSE_WAIT +50、Mongo 连接 200——正好是"连接泄漏"是否回归的判据。

## 注意

- 端口 `8870`（服务）、`27018`（mongo）、`19093`（kafka）在跑之前必须空闲；`up.sh` 会直接占用。
- 故障注入用例会**真实停掉测试用的 mongo/redpanda 容器**并在结束时恢复，不会碰线上。
- 用例会往 `reporter.apps` 写入测试应用 `64b7f0c2a1b2c3d4e5f60001`，库名固定为 `app_64b7f0c2a1b2c3d4e5f60001`，可用 `APP_ID` 环境变量覆盖。
- 故障注入组（`05_faults.sh`）整体约 10 分钟，其中 E12 需要等服务在 Mongo 不可达时走完两次 server selection 超时（约 60-90 秒）才监听端口。
- 服务以 `LOG_LEVEL=info` 启动（`service.sh` 已设），否则 `告警规则初始化完成` 等关键日志不可见。
