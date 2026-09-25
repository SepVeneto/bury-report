#!/usr/bin/env bash
# 启动/停止/重启被测服务（直接跑 release 二进制，便于读 /proc 观测 FD）
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

start() {
  if service_running; then
    echo "服务已在运行 pid=$(service_pid)"
    return 0
  fi
  if [ ! -x "$SERVICE_BIN" ]; then
    echo "找不到二进制: $SERVICE_BIN" >&2
    echo "请先构建: cd packages/logs && cargo build --release" >&2
    return 1
  fi

  # 用干净的 env 启动，避免 dotenv 或宿主环境污染
  # setsid 让进程脱离当前会话，否则父 shell 退出时会被一起回收
  (
    cd "$RUN_DIR"
    env -i \
      PATH="$PATH" \
      REPORT_DB_URL="$REPORT_DB_URL" \
      DB_NAME="$DB_NAME" \
      DB_PWD="$DB_PWD" \
      KAFKA_BROKERS="$KAFKA_BROKERS" \
      NOTIFY_TOKEN="$NOTIFY_TOKEN" \
      SALT="$SALT" \
      LOG_LEVEL="$LOG_LEVEL" \
      RUST_BACKTRACE=1 \
      setsid "$SERVICE_BIN" >>"$SERVICE_LOG" 2>&1 </dev/null &
    echo $! >"$SERVICE_PID_FILE"
  )
  sleep 1
  # setsid 在部分环境会再 fork 一次，用 cmdline 精确匹配拿真实 pid
  real_pid=$(pgrep -f "^${SERVICE_BIN}$" 2>/dev/null | tail -n 1)
  [ -n "$real_pid" ] && echo "$real_pid" >"$SERVICE_PID_FILE"

  local pid; pid=$(service_pid)
  # Mongo 不可达时启动会经历两次 server selection 超时（init_db + alert::init），放宽到 120s
  for i in $(seq 120); do
    if curl -sf -m 2 -o /dev/null "$LOG_URL/" 2>/dev/null || nc -z 127.0.0.1 8870 2>/dev/null; then
      echo "服务已启动 pid=$pid 日志=$SERVICE_LOG"
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "服务启动失败，日志末尾：" >&2
      tail -20 "$SERVICE_LOG" >&2
      return 1
    fi
    sleep 1
  done
  echo "服务端口未就绪，日志末尾：" >&2
  tail -20 "$SERVICE_LOG" >&2
  return 1
}

stop() {
  local pid; pid=$(service_pid)
  local extra; extra=$(pgrep -f "^${SERVICE_BIN}$" 2>/dev/null | tr '\n' ' ')
  if [ -z "$pid" ]; then
    if [ -z "$extra" ]; then
      echo "服务未运行"
      rm -f "$SERVICE_PID_FILE"
      return 0
    fi
  fi
  kill $pid $extra 2>/dev/null
  for i in $(seq 20); do
    kill -0 "$pid" 2>/dev/null || { [ -z "$extra" ] && break; }
    sleep 0.5
  done
  kill -9 $pid $extra 2>/dev/null
  rm -f "$SERVICE_PID_FILE"
  echo "服务已停止 pid=$pid ${extra:+extra=$extra}"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  restart) stop; sleep 1; start ;;
  status) service_running && echo "running pid=$(service_pid)" || echo "stopped" ;;
  logs) tail -"${2:-40}" "$SERVICE_LOG" ;;
  truncate-log) : >"$SERVICE_LOG"; echo "日志已清空" ;;
  *) echo "用法: $0 {start|stop|restart|status|logs [n]|truncate-log}" >&2; exit 1 ;;
esac
