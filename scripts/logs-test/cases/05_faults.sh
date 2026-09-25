#!/usr/bin/env bash
# E 组：异常与故障注入（RUN_FAULTS=1 开启，会真实停依赖容器并重启被测服务）
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
require_service

section "E. 异常与故障注入"

if [ "${RUN_FAULTS:-0}" != "1" ]; then
  skip "默认跳过故障注入（RUN_FAULTS=1 开启）"
  summary
  exit $?
fi

wait_mongo() {
  for _ in $(seq 60); do
    if docker exec "$MONGO_CONTAINER" mongo --quiet --eval 'db.adminCommand({ping:1}).ok' 2>/dev/null | grep -q 1; then
      return 0
    fi
    sleep 1
  done
  return 1
}
wait_kafka() {
  for _ in $(seq 60); do
    rpk cluster health 2>/dev/null | grep -q 'Healthy: *true' && return 0
    sleep 1
  done
  return 1
}
post_error() { # name message uuid
  local item; item=$(payload_error "$1" "$2" 'at f (a.js:1:2)' "$3" "s-$3")
  curl -sS -m 60 -o "$LAST_BODY" -w '%{http_code}' -H 'Content-Type: application/json' \
    --data-binary "$(payload_v2 "$item")" "$LOG_URL/record"
}

# ---------------- ERR-01 Mongo 停机 ----------------
docker stop "$MONGO_CONTAINER" >/dev/null
mk=$(mark)
st=$(post_error MongoDown "err01-$mk" "u-$mk")
assert_eq "E01 Mongo 停机时上报 -> HTTP 200" 200 "$st"
assert_body_code "E01 Mongo 停机时 body.code = 500" 500
if service_running; then ok "E01 进程未退出"; else bad "E01 进程未退出" "进程存活" "已退出"; fi
docker start "$MONGO_CONTAINER" >/dev/null; wait_mongo
mk=$(mark)
st=$(post_error MongoUp "err01b-$mk" "u-$mk")
assert_eq "E01 Mongo 恢复后上报 -> HTTP 200" 200 "$st"
assert_body_code "E01 Mongo 恢复后 body.code = 0" 0

# ---------------- ERR-05 Kafka 停机 ----------------
docker stop "$KAFKA_CONTAINER" >/dev/null
mk=$(mark)
st=$(curl -sS -m 60 -o "$LAST_BODY" -w '%{http_code}' -H 'Content-Type: application/json' \
  --data-binary "$(payload_v2 "$(payload_v1 __BR_TRACK__ "{\"m\":\"$mk\"}" "u-$mk" "s-$mk")")" "$LOG_URL/record")
assert_eq "E05 Kafka 停机时上报 track -> HTTP 200" 200 "$st"
assert_body_code "E05 Kafka 停机不影响接口返回（code 0）" 0
if service_running; then ok "E05 进程未退出"; else bad "E05 进程未退出" "进程存活" "已退出"; fi
docker start "$KAFKA_CONTAINER" >/dev/null; wait_kafka

# ---------------- ERR-03 flush 循环被 panic 打死 ----------------
section "E03 复现 flush 循环被 panic 打死"
: >"$SERVICE_LOG"
found=0
for attempt in 1 2 3; do
  [ "$found" = 1 ] && break
  mk="panic$attempt-$(mark)"
  (
    for i in $(seq 40); do
      addon=$(payload_error Panic "panic-$mk-$i" 'at f (a.js:1:2)' "u-$mk-$i" "s-$mk-$i")
      curl -sS -m 20 -o /dev/null -H 'Content-Type: application/json' \
        --data-binary "$(payload_v2 "$addon")" "$LOG_URL/record" >/dev/null 2>&1
      sleep 0.05
    done
  ) &
  poster=$!
  sleep 1
  docker stop "$MONGO_CONTAINER" >/dev/null
  wait "$poster" 2>/dev/null
  sleep 22
  docker start "$MONGO_CONTAINER" >/dev/null; wait_mongo
  grep -q 'panicked' "$SERVICE_LOG" && found=1
done

if [ "$found" = 1 ]; then
  ok "E03 复现成功：flush 循环因 .unwrap() panic 而终止"
  grep -m1 'panicked' "$SERVICE_LOG" | sed 's/^/       /'
else
  bad "E03 复现 flush 循环 panic" "日志出现 panicked" "未出现（可重跑 05_faults.sh）"
fi

mk=$(mark)
st=$(post_error AfterPanic "after-panic-$mk" "u-$mk")
assert_body_code "E03 panic 后接口仍可用（code 0）" 0
assert_eq "E03 错误仍写入 records_err" 1 "$(mongo_count "$APP_DB" records_err "{uuid:'u-$mk'}")"
fp=$(mongo_scalar "print(db.getSiblingDB('$APP_DB').records_err.findOne({uuid:'u-$mk'}).fingerprint)")
sleep 15
assert_eq "E03 证明：history_error 永久停写（flush 循环已死）" 0 \
  "$(mongo_count "$APP_DB" history_error "{fingerprint:'$fp'}")"

bash "$TEST_DIR/service.sh" restart >/dev/null
mk=$(mark)
st=$(post_error "AfterRestart-$mk" "after-restart-$mk" "u-$mk")
assert_body_code "E03 重启后可正常上报（code 0）" 0
fp=$(mongo_scalar "print(db.getSiblingDB('$APP_DB').records_err.findOne({uuid:'u-$mk'}).fingerprint)")
wait_count "$APP_DB" history_error "{fingerprint:'$fp'}" 1 30 "E03 重启服务后 history_error 恢复写入"

# ---------------- ERR-12 init 静默失败（启动时 Mongo 不可达） ----------------
section "E12 复现 alert::init 静默失败"
bash "$TEST_DIR/service.sh" stop >/dev/null
bash "$TEST_DIR/service.sh" truncate-log >/dev/null
docker stop "$MONGO_CONTAINER" >/dev/null
if bash "$TEST_DIR/service.sh" start >/dev/null 2>&1; then
  started=1
else
  started=0
fi
docker start "$MONGO_CONTAINER" >/dev/null; wait_mongo
if [ "$started" = 1 ]; then
  assert_not_contains "E12 Mongo 不可用时启动，日志没有【告警规则初始化完成】" "$(cat "$SERVICE_LOG")" "告警规则初始化完成"
  mk=$(mark)
  st=$(post_error InitFail "initfail-$mk" "u-$mk")
  assert_body_code "E12 上报仍可用（code 0）" 0
  assert_eq "E12 数据仍写入 records_err" 1 "$(mongo_count "$APP_DB" records_err "{uuid:'u-$mk'}")"
  fp=$(mongo_scalar "print(db.getSiblingDB('$APP_DB').records_err.findOne({uuid:'u-$mk'}).fingerprint)")
  sleep 15
  assert_eq "E12 证明：flush 循环从未启动，history_error 为空" 0 \
    "$(mongo_count "$APP_DB" history_error "{fingerprint:'$fp'}")"
else
  bad "E12 Mongo 不可用时服务仍能启动" "服务能启动并监听 8870" "启动失败"
fi

bash "$TEST_DIR/service.sh" restart >/dev/null
assert_eq "E12 恢复 root 账号后服务可用" 0 "$(api_post "$(payload_v1 my_log '{}' "u-$mk-restore" s)" >/dev/null; body_code)"

# ---------------- ERR-13/14 退出信号：SIGINT 优雅 flush，SIGTERM 不 flush ----------------
section "E13/E14 退出信号行为"
bash "$TEST_DIR/service.sh" truncate-log >/dev/null
mk=$(mark)
st=$(post_error SigInt "sigint-$mk" "u-$mk")
assert_body_code "E13 SIGINT 前上报 -> code 0" 0
fp=$(mongo_scalar "print(db.getSiblingDB('$APP_DB').records_err.findOne({uuid:'u-$mk'}).fingerprint)")
pid=$(service_pid)
kill -INT "$pid" 2>/dev/null
for _ in $(seq 40); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
rm -f "$SERVICE_PID_FILE"
assert_contains "E13 SIGINT 触发优雅 flush 日志" "$(cat "$SERVICE_LOG")" "alert fact & summary flushed"
assert_eq "E13 SIGINT 退出前已把聚合落库" 1 "$(mongo_count "$APP_DB" history_error "{fingerprint:'$fp'}")"

bash "$TEST_DIR/service.sh" start >/dev/null
bash "$TEST_DIR/service.sh" truncate-log >/dev/null
mk=$(mark)
st=$(post_error SigTerm "sigterm-$mk" "u-$mk")
assert_body_code "E14 SIGTERM 前上报 -> code 0" 0
pid=$(service_pid)
kill -TERM "$pid" 2>/dev/null
for _ in $(seq 40); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
rm -f "$SERVICE_PID_FILE"
assert_not_contains "E14 SIGTERM 不触发优雅 flush（当前行为缺陷）" "$(cat "$SERVICE_LOG")" "alert fact & summary flushed"

bash "$TEST_DIR/service.sh" start >/dev/null
assert_eq "E14 恢复服务可用" 0 "$(api_post "$(payload_v1 my_log '{}' "u-$mk-last" s)" >/dev/null; body_code)"

summary
