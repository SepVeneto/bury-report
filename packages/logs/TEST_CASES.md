# report-logs 测试用例集

> 对象：`packages/logs`（容器 `report-logs`，HTTP:8870）
> 依据：当前 `main` 分支代码的实际行为整理，**未做任何代码修改**。
> 标注 `⚠️当前行为` 的用例，预期结果按"现在实际会怎样"写；`🐞已知问题` 表示该行为是缺陷，后续修复时这些用例即为回归基线。

---

## 0. 前置条件与测试数据

### 0.1 环境

| 项 | 值 |
|---|---|
| 依赖 | MongoDB（`REPORT_DB_URL`/`DB_NAME`/`DB_PWD`）、Kafka/Redpanda（`KAFKA_BROKERS`）、可选 `SALT`、`NOTIFY_TOKEN` |
| 观测工具 | `mongosh`、`rpk topic consume rrweb\|notify`、`docker stats`、`ls /proc/1/fd \| wc -l` |
| 日志级别 | 默认 `info`；线上需确认 `RUST_LOG` 未覆盖为 `error`，否则所有 `info!` 不可见 |
| 数据库命名 | 业务库 `app_<appid>`（appid 为 24 位 ObjectId hex）；`reporter.apps` 存应用元数据 |

### 0.2 集合与用途

| 集合 | 写入时机 |
|---|---|
| `records_device` | `__BR_COLLECT_INFO__`，按 `uuid` upsert |
| `records_session` | `__BR_COLLECT_INFO__`，按 `session` insert-unique |
| `records_api` | `__BR_API__` |
| `records_err` | `__BR_COLLECT_ERROR__`（含 `fingerprint`，`summary` 字段 `serde(skip)` 不入库） |
| `records_log` | 其它/自定义 type |
| `records_custom_id` | `__BR_CUSTOM_ID__`，按 `id` upsert，`$addToSet` device/session |
| `history_error` | 每 10s 由 flush 循环聚合写入（`fingerprint` 为唯一键） |
| `alert_fact` | 命中带 URL 的规则后，每 10s 由 flush 循环写入 |
| `alert_rule` | 由管理端写入，通过 `/notify/sync-alert-rule` 通知本服务 |
| Kafka `rrweb` | `__BR_TRACK__` / `__BR_TRACK_EVENT__` / 二进制协议原始数据 |
| Kafka `notify` | 命中规则且需要通知时 |

### 0.3 请求模板

统一 `POST /record`，`Content-Type: application/json`，可带 `X-Real-IP` 头。

```jsonc
// V1 单条：设备
{"type":"__BR_COLLECT_INFO__","appid":"<appid>","data":{"ua":"okhttp"},"uuid":"d-1","session":"s-1","time":"2026-09-25 10:00:00"}
// V1 单条：错误
{"type":"__BR_COLLECT_ERROR__","appid":"<appid>","data":{"name":"TypeError","message":"x is undefined","stack":"at foo (a.js:12:34)\n?token=abc"},"uuid":"d-1","session":"s-1"}
// V1 单条：网络 / 自定义日志 / track / custom id
{"type":"__BR_API__", ...} / {"type":"my_log", ...} / {"type":"__BR_TRACK__", ...} / {"type":"__BR_CUSTOM_ID__","data":{"id":"user-123"}, ...}
// V2 批量（每一项都是上面的 V1 结构）
{"appid":"<appid>","data":[ {V1}, {V1} ]}
// 二进制协议：首字节 0x00 + "<sessionid>:<appid>|" + 原始字节
```

---

## A. 接口与协议

| 编号 | 用例 | 步骤 | 预期结果 |
|---|---|---|---|
| API-01 | 正常上报返回 | 发一条合法 V1 自定义日志 | HTTP 200，`{"code":0,"message":"ok","data":""}` |
| API-02 | 空 body | `curl -X POST /record --data-binary ''` | ⚠️**HTTP 200 + `{"code":500,"message":"校验错误: FOO!, in src/apis/record.rs:50:22"}`**。`InvalidError` 本该走 400 分支，但 `record_log` 把 `payload_handler` 的 Err 又包成了 `ValidateError`，400 分支实际是死代码 🐞 |
| API-03 | 首字节为 1 | body 首字节 `0x01` | 同 API-02：HTTP 200 + code 500 + `FOO!` 🐞 |
| API-04 | 二进制协议正常 | `0x00 + "sess-1:appid|" + payload` | HTTP 200 code 0；Kafka `rrweb` 收到一条，key=`appid/sess-1` |
| API-05 | 二进制协议缺 `|` | `0x00 + "sess-1:appid" + payload` | 同 API-02：HTTP 200 + code 500 + `FOO!` 🐞 |
| API-06 | 二进制协议缺 `:` | `0x00 + "sess-1appid|" + payload` | 同 API-02：HTTP 200 + code 500 + `FOO!` 🐞 |
| API-07 | 二进制协议 session/appid 非 UTF-8 | 注入 `0xff` 字节 | HTTP 400 |
| API-08 | 二进制协议不校验 appid | 用不存在的 appid 走二进制协议 | ⚠️当前行为：仍 HTTP 200，数据直接进 Kafka，不查库、不校验 |
| API-09 | JSON 解析失败 | `{"foo":1}` | ⚠️当前行为：**HTTP 200 + `{"code":500,...}`**（不是 4xx） |
| API-10 | appid 非 ObjectId | `"appid":"abc"` | ⚠️当前行为：HTTP 200 + code 500（`OidGenError` 文案） |
| API-11 | 应用不存在 | 合法 ObjectId 但 `reporter.apps` 无此记录 | HTTP 200 + code 500，message 含"没有对应的应用" |
| API-12 | body 超 10MB | 依次发送 11MB / 30MB body | ⚠️`PayloadConfig::new(10MB)` **未生效**：11MB 正常返回 code 0；30MB 一路走到落库，被 MongoDB 16MB 文档上限拦下，返回 HTTP 200 + code 500（message 含 `16777216 bytes`）🐞 |
| API-13 | 非法 HTTP 头 | 发送畸形请求头 | 连接被拒，日志出现 `actix_http::h1::dispatcher ... invalid Header provided`（线上实际观察到过） |
| API-14 | `/verify_ticket` 未注册 | `POST /verify_ticket` | 404（该 handler 只写了 `#[post]`，未注册到 `routes::services`）🐞 |
| API-15 | 并发同一 session | 20 个并发 V1 设备上报，session 相同、uuid 不同 | ⚠️实测 20 并发产生了 10 条重复的 `records_session` 文档：`insert_unique` 是先 `find_one` 再 `insert_one`，而 `init_db` 建的 `session` 索引不是唯一索引 🐞（回归套件里记为 known-issue，不阻塞 CI） |

## B. 上报类型 → 落库/转发映射

前置：`reporter.apps` 中存在 `appid` 对应记录。

| 编号 | 用例 | 步骤 | 预期结果 |
|---|---|---|---|
| ING-01 | 设备首次上报 | 发 `__BR_COLLECT_INFO__`（uuid=d-1, session=s-1, 带 `X-Real-IP: 1.2.3.4`） | `records_device` 新增 1 条，`uuid=d-1`、`ip=1.2.3.4`、含 `data.create_time/update_time`；`records_session` 新增 1 条 |
| ING-02 | 设备重复上报（同 uuid） | 再发一次同 uuid、改 `data` | `records_device` 仍 1 条，`data` 与 `update_time` 被更新，无重复 |
| ING-03 | 设备无 session | `session` 字段缺省 | `records_device` 正常写入；`records_session` 不新增 |
| ING-04 | 无 `X-Real-IP` | 不发该头 | `records_device.ip` 为 null |
| ING-05 | 网络日志 | 发 `__BR_API__` | `records_api` 新增 1 条 |
| ING-06 | 错误日志 | 发 `__BR_COLLECT_ERROR__` | `records_err` 新增 1 条，含大写 MD5 `fingerprint`；**无 `summary` 字段**（`serde(skip)`） |
| ING-07 | 自定义日志 | `type` 为任意未识别值 | `records_log` 新增 1 条 |
| ING-08 | track（V1） | 发 `__BR_TRACK__` 且 `session` 存在 | Kafka `rrweb` 收到 1 条，key=`<appid>/<session>`；Mongo 无写入 |
| ING-09 | track（V1）无 session | `session` 缺省 | ⚠️当前行为：静默丢弃，不报错、不进 Kafka |
| ING-10 | 小程序 track | 发 `__BR_TRACK_EVENT__` | 同 ING-08 |
| ING-11 | custom id | 发 `__BR_CUSTOM_ID__`，`data.id=user-123`，带 `SALT` | `records_custom_id` 新增 1 条，`id` = `MD5("user-123-<SALT>")` 大写，`device`/`session` 数组含本次值 |
| ING-12 | custom id 无 session | `session` 缺省 | ⚠️当前行为：`session` 数组会出现 `null` 元素（`$addToSet: {session: null}`）🐞 |
| ING-13 | custom id 幂等 | 同 id、不同设备上报两次 | 1 条文档，`device` 数组去重累加 |
| ING-14 | V2 批量混合类型 | 一批含 device/network/error/custom/track | 各集合分别写入；`records_log` 收 collect 项；track 仅进 Kafka；HTTP 200 code 0 |
| ING-15 | V2 空 data 数组 | `{"appid":"x","data":[]}` | HTTP 200 code 0，无任何写入 |
| ING-16 | V2 中 item.appid 与 v2.appid 不一致 | v2.appid=A，item.appid=B | ⚠️当前行为：写入 `app_A` 库，但文档内 `appid` 字段为 B（数据不一致）🐞 |
| ING-17 | V2 落库顺序/并行 | 一批含 3 类数据 | 5 类 `insert_group` 由 `join_all` 并发执行，互不阻塞；track 在落库之后发送 |
| ING-18 | V2 中某项落库失败 | 构造一项非法数据 | ⚠️当前行为：HTTP 200 + code 500，**已成功的部分不回滚**（部分写入） |
| ING-19 | `data` 非对象 | `"data": 123` | `deserialize_reocrd_data` 包装为 `{"msg":123}`，正常入库 |
| ING-20 | `stamp`/`time` 可选 | 不传 `stamp`/`time` | 入库字段为 null，不报错 |
| ING-21 | session 幂等（串行） | 同 session、不同 uuid 顺序上报两次 | `records_session` 仍只有 1 条（`insert_unique` 在串行下成立） |
| ING-22 | 指纹算法精确值 | 用固定 `name`/`message`/`stack` 上报 | `records_err.fingerprint` == `MD5(name + " " + message + " " + 归一化stack)`，其中行号被换成 `{line}:{col}`、query 换成 `{query}` |
| ING-23 | `is_delete` 应用仍可上报 | 把 `reporter.apps.is_delete` 置为 true 后上报 | ⚠️当前行为：`find_by_id` 只按 `_id` 查询，不看 `is_delete`，数据照常入库 🐞 |

## C. 告警规则、指纹与通知

前置：为 `app_<appid>` 建好 `alert_rule`，通过 `GET /notify/sync-alert-rule`（带 `notify-token` 与 `appid` 头）同步；用 `rpk topic consume notify` 观察推送。

| 编号 | 用例 | 步骤 | 预期结果 |
|---|---|---|---|
| ALR-01 | 规则同步成功 | 合法 `notify-token` + 合法 appid 头 | HTTP 200 code 0；`RULE_MAP["app_<appid>"]` 生效，后续错误可按规则命中 |
| ALR-02 | token 错误 | 发送错误 `notify-token` | ⚠️当前行为：HTTP 200 + code 0（仅打 error 日志），调用方无法区分失败 🐞 |
| ALR-03 | 缺 `notify-token` 头 | 不带头 | ⚠️同上，HTTP 200 code 0 🐞 |
| ALR-04 | appid 头缺失 | 合法 token、无 appid 头 | HTTP 200 + code 500（`cannot find appid`） |
| ALR-05 | 同步时规则被删除 | 删除 `alert_rule` 文档后再次同步 | 该 app 的规则集合被最新查询结果整体替换 |
| ALR-06 | 指纹归一化：行列号 | 两条错误仅 `stack` 中 `a.js:12:34` / `a.js:99:1` 不同 | 同一 `fingerprint`，`history_error.count` 累加 |
| ALR-07 | 指纹归一化：query | `?token=abc` 与 `?token=xyz` | 同一 `fingerprint` |
| ALR-08 | 指纹区分：message 不同 | message 分别为 `x` / `y` | 不同 `fingerprint`，两条 `history_error` |
| ALR-09 | 指纹基数爆炸（动态 message） | 连续上报 1 万条 message 含随机 traceId | ⚠️当前行为：生成 1 万个不同 fingerprint，`SUMMARY_MAP`/`ALERT_MAP` 随之线性膨胀 🐞 |
| ALR-10 | 分组规则命中 | 配置 group `condition:[literal route, literal webview, number]`，上报匹配消息 | `fingerprint` = `MD5(rule._id hex)`，`summary` 中数字被替换为 `<NUMBER>`（UUID 则为 `<UUID>`） |
| ALR-11 | 规则优先级 | 同时存在 fingerprint / type / collection 规则 | 命中顺序：**fingerprint（含分组）> type > collection** |
| ALR-12 | type 规则不可达 | 尝试配置"按错误类型"的规则 | ⚠️`AlertRuleMap.types` 在 `from_models` 中从未写入（`AlertSource` 无 type 变体），type 分支为死代码 🐞 |
| ALR-13 | collection 规则命中 | 配置 `source.collection.log_type=error` | 所有错误均可命中该规则 |
| ALR-14 | 规则无 url | 规则 `url` 为 null | 不写 `alert_fact`、不发 `notify`（`check_notify` 直接返回） |
| ALR-15 | Once 策略 | 同一指纹上报 1 次等 flush，再上报第 2 次等 flush | 只推 1 次；**首次** `alert_fact.ttl=604800`（7 天，硬编码）。但第 2 次出现时 `and_modify` 用 `rule.ttl()`（Once 为 None）覆盖 ttl → 文档里 `ttl` 变 null，GC 的 `ttl=None` 分支恒为"保留" → **该指纹此后永不回收** 🐞 |
| ALR-16 | Window 策略 | `window_sec=60`，同一指纹连续上报 3 次 | 只推 1 次（窗口内抑制）。二次触发不是"静默超过 window_sec"就会发生：`is_expired` 比较的是 `last_seen`，而它在检查前刚被刷新，所以必须等该 fact 先被 GC 回收（静默 > window_sec 且跨过一个 10s flush 周期）后再出现才会重推 🐞 |
| ALR-17 | Limit 策略 | `limit=3`，同一指纹持续上报 10 次 | ⚠️当前行为：只在第 3 次触发 1 次；`flush_count` 从不清零，之后永不再推 🐞 |
| ALR-18 | 通知消息内容 | 触发一次 Once 告警 | Kafka `notify` 收到 `{url,name,type,rule,fact,content}`；`fact` 中不含 `flush_count/need_update`（`serde(skip)`） |
| ALR-19 | 下游推送模板 | worker 消费 notify | 按 strategy 渲染 markdown 并 POST 到 `url` |
| ALR-20 | V1 错误不告警 | 用 V1 单条发 `__BR_COLLECT_ERROR__` | ⚠️当前行为：只落 `records_err`，**不触发任何告警**（只有 V2 路径调用 `alert_error`）🐞 |
| ALR-21 | 规则变更后旧指纹 | 命中指纹规则后删除该规则 | 已存在的 `alert_fact` 按 TTL 自然过期，不会立即清理 |
| ALR-22 | 规则文档字段类型错误 | 把 `limit`/`window_sec` 存成 double（shell 里写 `limit:3` 就是 double） | ⚠️`find_all` 整表反序列化失败 → `/notify/sync-alert-rule` 返回 code 500，**该 app 整份规则都不生效**；启动阶段则走 `获取规则失败` 分支用空 vec，等于规则全丢 🐞 |
| ALR-23 | `enabled=false` 的规则 | 同步一条 `enabled:false` 的 collection 规则后上报错误 | 不推 notify，也不生成 `alert_fact` |
| ALR-24 | 分组规则 uuid 模式 | condition `[literal session, uuid]`，消息含 32 位 alnum token | 指纹 = `MD5(rule id hex)`；摘要中 UUID 被替换为 `<UUID>` |
| ALR-25 | 分组未命中回落 | 分组规则存在但消息不匹配 | 回落为 `MD5(name message stack)` 指纹（32 位） |
| ALR-26 | collection 规则 log_type 不匹配 | 规则 `log_type=api`，上报错误日志 | 不命中（`alert_error` 只传 `CollectionType::Error`），不推 notify、不落 fact |

## D. 聚合与 flush（10s 循环）

| 编号 | 用例 | 步骤 | 预期结果 |
|---|---|---|---|
| FLU-01 | 错误聚合落库 | 连续上报同一错误，等待 10s | `history_error` 出现 1 条，`count` 累加，`last_seen` 刷新 |
| FLU-02 | `first_seen` 语义 | 多次上报后检查 | `first_seen` 只在 `$setOnInsert` 写入一次，不随后续刷新 |
| FLU-03 | `rule_id` 语义 | 同一错误先命中规则、后在不命中规则的窗口再上报 | ⚠️`rule_id` 每轮被 `$set` 覆盖为**本轮**命中结果，本轮未命中会被写成 null（不是"只增不减"）🐞 |
| FLU-04 | 无规则也记录摘要 | 上报错误但无任何规则 | `history_error` 仍写入（`rule_id` 为 null） |
| FLU-05 | 告警事实落库 | 命中 Once 规则并触发 | 10s 内 `alert_fact` 出现对应 `fingerprint`，含 `strategy/ttl/last_seen/last_notify/count` |
| FLU-06 | 事实过期回收 | 构造 `ttl=60` 的 Window 规则，停止上报 61s | 内存中该 fact 被 `retain` 移除；**Mongo 中 `alert_fact` 文档不会被删除** ⚠️ |
| FLU-07 | Limit 事实不回收 | `limit` 规则持续上报 | `last_seen` 不断刷新 → fact 永不回收（commit 9ebf914 之后的行为） |
| FLU-08 | 启动加载历史 | 重启服务 | 启动时把 `app_*` 下所有 `alert_fact` 全量载入内存；历史很多时启动内存/耗时线性上升 |
| FLU-09 | 摘要窗口清空 | 观察两个窗口边界 | `SUMMARY_MAP` 每轮全量 `clear()`；写入期间的新条目可能被整轮丢弃（计数偏小）🐞 |
| FLU-10 | 单轮写入是串行的 | 单窗口 1 万条指纹 | 每指纹 1 次 `update_one`、串行执行；耗时会随指纹数线性增长 🐞 |
| FLU-11 | 聚合字段映射 | 分别上报带 `page` / 不带 `page` 的错误 | `history_error.name/message` 取自 `data`；`page` 有值存原值，缺省存**空字符串 `""`** |

## E. 异常与故障注入

| 编号 | 用例 | 步骤 | 预期结果 |
|---|---|---|---|
| ERR-01 | Mongo 停止 | 停掉 MongoDB 后上报 | `/record` 返回 200 + code 500；进程不退出；恢复 Mongo 后自动可继续 |
| ERR-02 | Mongo 慢（注入延迟） | 用 `tc`/代理加 500ms 延迟，持续上报 | 请求变慢但不雪崩；观察内存与 FD 是否单调上涨 🐞（无超时保护） |
| ERR-03 | Mongo 抖断后 flush 循环存活性 | 打断 Mongo 连接后恢复，再上报错误 30s | ⚠️当前行为风险点：flush 循环内 `.unwrap()`，一次写入失败会 panic 掉该 tokio task，此后 `history_error`/`alert_fact` 永久停写、内存不再回收（`panicked at src/alert/gc.rs`）🐞 |
| ERR-04 | flush 循环卡死 | 让一次 `update_one` 永久挂起 | ⚠️无超时：循环停在 await，`SUMMARY_MAP.clear()` 不可达，内存单向增长且无日志 🐞 |
| ERR-05 | Kafka 不可用 | 停掉 Kafka 后上报 track | `/record` 不 panic；发送失败仅打 error；Mongo 写入不受影响 |
| ERR-06 | Kafka 队列打满 | 持续发送 track，Kafka 不消费 | ⚠️`BaseProducer::send`/`flush(10s)` 为同步阻塞调用，会占用 actix worker 线程，请求延迟上升 🐞 |
| ERR-07 | 仅 notify 无 track 的批次 | 一批错误（无 track）触发告警 | ⚠️`send_batch_to_kafka` 对空 track 直接 return，该批 notify 消息不会被 flush/poll 🐞 |
| ERR-08 | Kafka 恢复 | 恢复 Kafka 后继续上报 | 无需重启即可继续发送；无残留阻塞 |
| ERR-09 | 单条超大文档 | 构造接近 16MB 的错误 summary | `history_error` upsert 报错 → 触发 ERR-03 的 `.unwrap()` 风险 🐞 |
| ERR-10 | `insert_many` 失败 | 构造批量写入失败 | ⚠️`src/model.rs:191` 使用 `.unwrap()`，请求路径会 panic 🐞 |
| ERR-11 | 启动时依赖缺失 | 去掉 `REPORT_DB_URL`/`KAFKA_BROKERS` | 进程启动即 panic 退出，容器反复重启 |
| ERR-12 | 启动时 Mongo 不可达 | 停掉 MongoDB 后启动服务 | ⚠️客户端是懒连接不会 panic；`init_db` 报错后 `alert::init` 的 `list_database_names` 超时返回 Err，被 `let _ =` 吞掉 → HTTP 仍正常监听，但 **flush 循环不会被 spawn，且无任何日志**（已在 `05_faults.sh` 复现）🐞 |
| ERR-13 | SIGINT（Ctrl-C）退出 | 上报错误后立刻 `kill -INT` | 走 `ctrl_c()` 分支：日志出现 `alert fact & summary flushed`，退出前把 `SUMMARY_MAP` 落库 |
| ERR-14 | SIGTERM 退出 | 上报错误后立刻 `kill -TERM` | ⚠️`ctrl_c()` 只监听 SIGINT，SIGTERM（`docker stop` 默认信号）直接终止进程，**不做优雅 flush**，最后 10 秒窗口的聚合会丢 🐞 |

## F. 非功能与可观测性

| 编号 | 用例 | 步骤 | 预期结果 |
|---|---|---|---|
| NFR-01 | 稳态内存锯齿 | 稳定流量下持续观察 30 分钟 | 内存"先涨后降"，不出现单向爬升 |
| NFR-02 | FD 稳定性 | 每 30s 采样 `ls /proc/1/fd \| wc -l` | 数值围绕基线波动，**不单调增长**（基线应为百级） |
| NFR-03 | CLOSE_WAIT 归零 | `awk '{print $4}' /proc/1/net/tcp \| sort \| uniq -c` | 无大量 `08`（CLOSE_WAIT）堆积 |
| NFR-04 | Mongo 连接池上限 | 采样 `db.serverStatus().connections` | `current` 不超过配置的 `max_pool_size`；`totalCreated` 增速与请求量同阶，不是每请求一条 |
| NFR-05 | 指纹基数上界 | 注入 300 条唯一错误 + Once 规则，观察 RSS 与 `alert_fact` 条数（`06_nfr.sh` NFR05） | 当前无上限：RSS 与唯一指纹数同阶增长；脚本断言 RSS 增量 < 100MB 且每个唯一指纹都落了 `alert_fact`，用来在改动 GC/TTL 时发现回归 |
| NFR-06 | 启动自检日志 | 以 `LOG_LEVEL=info` 启动 | 日志包含 `starting HTTP server`、`========应用app_x========`、`初始化事实N条`、`告警规则初始化完成` |
| NFR-07 | 日志级别自检 | 以 `RUST_LOG=error` 启动 | ⚠️上述 info 全部不可见（线上现状），排障时须显式改为 `info` |
| NFR-08 | 单请求内存放大 | 发送 10MB 合法 body | 峰值内存 ≈ body 的若干倍（`to_bytes` + 反序列化 + `data.clone()`），随并发线性放大 |
| NFR-09 | 并发压测 | 200 并发持续 10 分钟 | 无 panic、无 5xx 风暴、P99 稳定；结束后内存回落 |
| NFR-10 | 退出信号 | 分别发送 SIGINT 与 SIGTERM（`05_faults.sh` E13/E14） | ⚠️`src/main.rs:70` 监听的是 `ctrl_c()`（SIGINT）：SIGINT 会 flush Kafka + `alert_flush` 后优雅退出；**SIGTERM（`docker stop` 默认信号）不触发优雅退出**，直接终止、不落盘 🐞 |

## G. 回归清单（针对已确认缺陷）

| 编号 | 关联缺陷 | 验证方式 |
|---|---|---|
| REG-01 | Mongo 驱动 `async-std-runtime` 跑在 tokio 上导致 socket 泄漏 | 压测 30 分钟后 FD 不增长、无 CLOSE_WAIT 堆积（对应 NFR-02/03/04） |
| REG-02 | flush 循环 `.unwrap()` 被 panic 打死 | 注入一次 Mongo 写失败，循环应继续（ERR-03） |
| REG-03 | flush 循环无超时被卡死 | 注入挂起操作，循环应超时重试而非永久停住（ERR-04） |
| REG-04 | `alert::init` 错误被 `let _ =` 吞掉 | 注入 init 失败，日志应明确报错（ERR-12） |
| REG-05 | 内存 map 无上限 | 高基数指纹下内存有界（NFR-05） |
| REG-06 | Limit 策略只推一次 | `flush_count` 按窗口重置（ALR-17） |
| REG-07 | `sync-alert-rule` token 校验无反馈 | token 错误应返回非 0 code（ALR-02/03） |
| REG-08 | V1 错误不触发告警 | V1/V2 行为一致（ALR-20） |
| REG-09 | `verify_ticket` 路由未注册 | 注册或删除（API-14） |
| REG-10 | Kafka 同步发送阻塞 worker | 压测时 worker 线程不被占用（ERR-06/07） |
| REG-11 | Once 规则 fact 第二次出现后 ttl 被清空 → 永不回收 | 第二次出现后 `alert_fact.ttl` 仍应为 604800（ALR-15） |
| REG-12 | 单条规则文档类型错误导致整份规则失效 | 错误文档只应被跳过，其余规则仍生效（ALR-22） |
| REG-13 | 无效 payload 的 400 分支是死代码、10MB 上限未生效 | 空 body/超限应返回 4xx（API-02/03/05/06/12） |
| REG-14 | SIGTERM 不做优雅 flush | SIGTERM 也应落库（ERR-14） |
| REG-15 | 并发同 session 插入重复文档 | `session` 上建唯一索引或改成 upsert（API-15） |

---

## H. 建议的自动化落点

> 已落地的可执行版本在 [`scripts/logs-test/`](../../scripts/logs-test/README.md)：`up.sh` 起依赖 → `service.sh start` 起服务 → `run-all.sh` 跑 A/B/C/D，`RUN_FAULTS=1` 追加 E 组故障注入，`RUN_NFR=1` 追加 F 组压测观测。
>
> 用例号与脚本的对应关系：`01_api.sh`→A 组，`02_ingest.sh`→B 组，`03_alert.sh`→C 组，`04_flush.sh`→D 组，`05_faults.sh`→E 组，`06_nfr.sh`→F 组，`07_matrix.sh`→上面这些分支的补齐项（API-07/15、ING-04/10/19/20/21/22/23、ALR-18b/23/24/25/26、FLU-11、ERR-11）。
>
> 已确认是缺陷但暂未修复的行为（如 API-15 并发重复 session、ALR-15 ttl 被清空）在脚本里用 `WARN` 输出，计入 `known-issue` 而不让回归套件变红；修复后该行会变成 `PASS`。

| 层次 | 覆盖对象 | 说明 |
|---|---|---|
| 单元测试（无外部依赖） | `alert::normalize_error`、`is_expired`、`Tokenizer`、`GroupPattern::is_match`、`is_number`/`is_uuid`、`desensitize`、指纹归一化正则 | 纯函数，最容易补，可覆盖 ALR-06~11、ING-11 |
| 接口测试（`actix_web::test`） | `payload_handler` 的分支、`Response` 的错误码语义 | 覆盖 A 组；`ApiError::InvalidError` 与其它错误的差异必须断言 |
| 集成测试（docker mongo + redpanda） | 各类型落库映射、V2 批量、flush 循环、告警链路 | 覆盖 B/C/D/E 组；建议用独立库名（`app_test_*`）避免污染 |
| 长稳压测（脚本 + 指标采集） | FD/CLOSE_WAIT/连接池/内存/RSS | 覆盖 F/G 组，全部围绕本次事故的回归 |
