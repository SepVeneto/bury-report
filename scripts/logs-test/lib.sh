#!/usr/bin/env bash
# report-logs 测试套件公共库

set -uo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$TEST_DIR/../.." && pwd)"
RUN_DIR="${RUN_DIR:-/tmp/logs-test}"

# ---- 被测对象 ----
APP_ID="${APP_ID:-64b7f0c2a1b2c3d4e5f60001}"
APP_DB="app_${APP_ID}"
LOG_URL="${LOG_URL:-http://127.0.0.1:8870}"
SERVICE_BIN="${SERVICE_BIN:-$ROOT_DIR/packages/logs/target/release/bury-report-logs}"

# ---- 依赖服务 ----
MONGO_CONTAINER=logs-test-mongo
KAFKA_CONTAINER=logs-test-redpanda
COMPOSE="docker compose -f $TEST_DIR/docker-compose.yaml"
MONGO_URI="mongodb://root:root_123@127.0.0.1:27017/?authSource=admin"

# ---- 被测服务环境变量 ----
export REPORT_DB_URL="${REPORT_DB_URL:-127.0.0.1:27018}"
export DB_NAME="${DB_NAME:-root}"
export DB_PWD="${DB_PWD:-root_123}"
export KAFKA_BROKERS="${KAFKA_BROKERS:-127.0.0.1:19093}"
export NOTIFY_TOKEN="${NOTIFY_TOKEN:-test-token}"
export SALT="${SALT:-test-salt}"
export LOG_LEVEL="${LOG_LEVEL:-info}"

mkdir -p "$RUN_DIR"
LAST_BODY="$RUN_DIR/last.json"
SERVICE_PID_FILE="$RUN_DIR/service.pid"
SERVICE_LOG="$RUN_DIR/service.log"

# ---------- 输出与断言 ----------
if [ -t 1 ]; then C_G=$'\033[32m'; C_R=$'\033[31m'; C_Y=$'\033[33m'; C_0=$'\033[0m'; else C_G=; C_R=; C_Y=; C_0=; fi
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
WARN_COUNT=0

section() { printf '\n%s\n' "$*"; }
ok()   { PASS_COUNT=$((PASS_COUNT + 1)); printf '  %sPASS%s %s\n' "$C_G" "$C_0" "$1"; }
bad()  { FAIL_COUNT=$((FAIL_COUNT + 1)); printf '  %sFAIL%s %s\n       期望: %s\n       实际: %s\n' "$C_R" "$C_0" "$1" "$2" "$3"; }
skip() { SKIP_COUNT=$((SKIP_COUNT + 1)); printf '  %sSKIP%s %s\n' "$C_Y" "$C_0" "$1"; }
warn() { WARN_COUNT=$((WARN_COUNT + 1)); printf '  %sWARN%s %s\n       说明: %s\n' "$C_Y" "$C_0" "$1" "$2"; }

assert_eq() { # 描述 期望 实际
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "$2" "$3"; fi
}
assert_contains() { # 描述 文本 子串
  case "$2" in *"$3"*) ok "$1" ;; *) bad "$1" "包含 '$3'" "$2" ;; esac
}
assert_not_contains() { # 描述 文本 子串
  case "$2" in *"$3"*) bad "$1" "不含 '$3'" "$2" ;; *) ok "$1" ;; esac
}
assert_ge() { # 描述 实际 下限
  if [ "$2" -ge "$3" ] 2>/dev/null; then ok "$1"; else bad "$1" ">= $3" "$2"; fi
}
assert_le() { # 描述 实际 上限
  if [ "$2" -le "$3" ] 2>/dev/null; then ok "$1"; else bad "$1" "<= $3" "$2"; fi
}

summary() {
  printf '\n%s: %d passed, %d failed' "$(basename "$0")" "$PASS_COUNT" "$FAIL_COUNT"
  [ "$SKIP_COUNT" -gt 0 ] && printf ', %d skipped' "$SKIP_COUNT"
  [ "$WARN_COUNT" -gt 0 ] && printf ', %d known-issue' "$WARN_COUNT"
  printf '\n'
  [ "$FAIL_COUNT" -eq 0 ]
}

mark() { echo "mk$(date +%s%N | tail -c 9)"; }

# ---------- Mongo ----------
mongo_eval() {
  docker exec -i "$MONGO_CONTAINER" mongo --quiet "$MONGO_URI" --eval "$1" 2>&1 | tr -d '\r'
}
mongo_scalar() { mongo_eval "$1" | grep -v '^connecting' | tail -n 1; }
mongo_count() { # db coll filter(js)
  mongo_scalar "print(db.getSiblingDB('$1').getCollection('$2').countDocuments($3))"
}
mongo_field() { # db coll filter(js) 字段表达式 -> 值（数值/字符串/布尔）
  mongo_scalar "var d = db.getSiblingDB('$1').getCollection('$2').findOne($3); print(d ? $4 : '')"
}
mongo_has() { # db coll filter(js) 字段名 -> true/false
  mongo_scalar "var d = db.getSiblingDB('$1').getCollection('$2').findOne($3); print(d ? d.hasOwnProperty('$4') : 'nodoc')"
}
new_oid() { python3 -c 'import os; print(os.urandom(12).hex())'; }

# 断言"当前存在但已确认是缺陷"的行为：不符合期望时记 WARN，不让回归套件变红
assert_no_bug() { # 描述 期望 实际 缺陷说明
  if [ "$2" = "$3" ]; then
    ok "$1"
  else
    warn "$1 未复现（期望 $2，实际 $3）" "$4"
  fi
}

wait_count() { # db coll filter 期望 超时 描述
  local db=$1 coll=$2 filter=$3 want=$4 t=${5:-30} desc=${6:-$2}
  local got="" end=$((SECONDS + t))
  while [ "$SECONDS" -lt "$end" ]; do
    got=$(mongo_count "$db" "$coll" "$filter")
    [ "$got" = "$want" ] && break
    sleep 1
  done
  assert_eq "$desc" "$want" "$got"
}

# ---------- HTTP ----------
api_post() { # body [额外 header...]
  local body=$1; shift
  curl -sS -m 30 -o "$LAST_BODY" -w '%{http_code}' \
    -H 'Content-Type: application/json' "$@" --data-binary "$body" "$LOG_URL/record"
}
api_post_raw() { # session appid payload
  printf '\x00%s:%s|%s' "$1" "$2" "$3" | curl -sS -m 30 -o "$LAST_BODY" -w '%{http_code}' --data-binary @- "$LOG_URL/record"
}
api_get() { # path [额外 header...]
  local path=$1; shift
  curl -sS -m 30 -o "$LAST_BODY" -w '%{http_code}' "$@" "$LOG_URL$path"
}
body_code() { jq -r '.code // "no-code"' "$LAST_BODY" 2>/dev/null || echo "not-json"; }
body_message() { jq -r '.message // ""' "$LAST_BODY" 2>/dev/null || echo ""; }

assert_body_code() { # 描述 期望
  local got; got=$(body_code)
  assert_eq "$1" "$2" "$got"
}

# ---------- Kafka ----------
rpk() { docker exec -i "$KAFKA_CONTAINER" rpk "$@"; }
kafka_has() { # topic marker 超时 -> 0 找到
  local topic=$1 marker=$2 t=${3:-15} out
  # 注意：rpk 在管道里是块缓冲，先完整读到 EOF 再匹配；也不要让 pipefail 影响判断
  out=$(timeout "$t" docker exec -i "$KAFKA_CONTAINER" rpk topic consume "$topic" --offset start --format '%v\n' 2>/dev/null)
  printf '%s' "$out" | grep -q -F -- "$marker"
}
kafka_tail_has() { # topic marker 超时（只看新消息）
  local topic=$1 marker=$2 t=${3:-15} out
  out=$(timeout "$t" docker exec -i "$KAFKA_CONTAINER" rpk topic consume "$topic" --offset end --format '%v\n' 2>/dev/null)
  printf '%s' "$out" | grep -q -F -- "$marker"
}
kafka_none() { # topic 等待秒数 -> 0 表示没有新消息
  local topic=$1 t=${2:-8} out
  out=$(timeout "$t" docker exec -i "$KAFKA_CONTAINER" rpk topic consume "$topic" --offset end --format '%v\n' 2>/dev/null)
  [ -z "$out" ]
}

# ---------- 被测进程 ----------
service_pid() { [ -f "$SERVICE_PID_FILE" ] && cat "$SERVICE_PID_FILE" || echo ""; }
service_running() {
  local pid; pid=$(service_pid)
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}
fdstat() { python3 "$TEST_DIR/fdstat.py" "$(service_pid)"; }
rss_kb() { awk '/VmRSS/{print $2}' "/proc/$(service_pid)/status" 2>/dev/null; }

require_service() {
  if ! service_running; then
    echo "服务未运行，请先执行: scripts/logs-test/up.sh && scripts/logs-test/service.sh start" >&2
    exit 2
  fi
}

# ---------- 常用 payload ----------
payload_v1() { # type data-json uuid session
  printf '{"type":"%s","appid":"%s","data":%s,"uuid":"%s","session":"%s"}' \
    "$1" "$APP_ID" "$2" "$3" "$4"
}
payload_error() { # name message stack uuid session
  printf '{"type":"__BR_COLLECT_ERROR__","appid":"%s","data":{"name":"%s","message":"%s","stack":"%s"},"uuid":"%s","session":"%s"}' \
    "$APP_ID" "$1" "$2" "$3" "$4" "$5"
}
payload_v2() { # data 数组元素(以逗号分隔)
  printf '{"appid":"%s","data":[%s]}' "$APP_ID" "$1"
}
