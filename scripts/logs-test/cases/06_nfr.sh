#!/usr/bin/env bash
# F 组：非功能与可观测性（RUN_NFR=1 开启，含压测，约 1-3 分钟）
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
require_service

section "F. 非功能与可观测性"

if [ "${RUN_NFR:-0}" != "1" ]; then
  skip "默认跳过压测类用例（RUN_NFR=1 开启）"
  summary
  exit $?
fi

REQUESTS="${REQUESTS:-600}"
CONCURRENCY="${CONCURRENCY:-20}"

before=$(fdstat)
echo "  压测前: $before"

python3 - "$RUN_DIR/load.json" "$APP_ID" <<'PY'
import json, sys
path, appid = sys.argv[1], sys.argv[2]
with open(path, "w") as fh:
    json.dump({"type": "__BR_COLLECT_INFO__", "appid": appid,
               "data": {"ua": "load", "pad": "x" * 512}, "uuid": "load-dev", "session": "load-sess"}, fh)
PY

echo "  发送 $REQUESTS 个请求（并发 $CONCURRENCY）..."
start=$SECONDS
seq 1 "$REQUESTS" | xargs -P "$CONCURRENCY" -I{} curl -sS -m 20 -o /dev/null \
  -H 'Content-Type: application/json' --data-binary "@$RUN_DIR/load.json" "$LOG_URL/record"
elapsed=$((SECONDS - start))
echo "  压测结束，耗时 ${elapsed}s"

after=$(fdstat)
echo "  压测后: $after"

b_sock=$(printf '%s' "$before" | jq -r '.sockets // 0')
a_sock=$(printf '%s' "$after" | jq -r '.sockets // 0')
b_cw=$(printf '%s' "$before" | jq -r '.tcp_states.CLOSE_WAIT // 0')
a_cw=$(printf '%s' "$after" | jq -r '.tcp_states.CLOSE_WAIT // 0')
b_rss=$(printf '%s' "$before" | jq -r '.rss_kb // 0')
a_rss=$(printf '%s' "$after" | jq -r '.rss_kb // 0')
b_fd=$(printf '%s' "$before" | jq -r '.fds // 0')
a_fd=$(printf '%s' "$after" | jq -r '.fds // 0')

echo "  socket FD: $b_sock -> $a_sock (+$((a_sock - b_sock)))"
echo "  CLOSE_WAIT: $b_cw -> $a_cw (+$((a_cw - b_cw)))"
echo "  FD 总数: $b_fd -> $a_fd (+$((a_fd - b_fd)))"
echo "  RSS: ${b_rss}KB -> ${a_rss}KB (+$((a_rss - b_rss))KB)"

assert_le "NFR02 socket FD 增量 <= 300（回归：连接泄漏）" "$((a_sock - b_sock))" 300
assert_le "NFR03 CLOSE_WAIT 增量 <= 50（回归：僵尸连接）" "$((a_cw - b_cw))" 50

conn_cur=$(mongo_scalar "print(db.serverStatus().connections.current)")
conn_created1=$(mongo_scalar "print(db.serverStatus().connections.totalCreated)")
sleep 20
conn_created2=$(mongo_scalar "print(db.serverStatus().connections.totalCreated)")
echo "  Mongo current=$conn_cur totalCreated: $conn_created1 -> $conn_created2 (+$((conn_created2 - conn_created1))/20s)"
assert_le "NFR04 Mongo 当前连接数 <= 200（回归：连接池失控）" "$conn_cur" 200
assert_le "NFR04 空闲 20s 内 Mongo 新建连接 <= 200" "$((conn_created2 - conn_created1))" 200

log_has_init=$(grep -c '告警规则初始化完成' "$SERVICE_LOG" 2>/dev/null)
[ -z "$log_has_init" ] && log_has_init=0
assert_ge "NFR06 启动日志含【告警规则初始化完成】" "$log_has_init" 1

sleep 15
after2=$(fdstat)
a2_sock=$(printf '%s' "$after2" | jq -r '.sockets // 0')
echo "  静置 15s 后 socket FD: $a_sock -> $a2_sock"
assert_le "NFR01 停止压测后 socket 不继续增长 <= 50" "$((a2_sock - a_sock))" 50

# ---- NFR05 高基数指纹 + Once 规则：回归"内存只增不减"形态 ----
echo
HC_ERRORS="${HC_ERRORS:-300}"
echo "  [NFR05] 高基数指纹内存观测（$HC_ERRORS 条唯一错误 + Once 规则）"
clear_rules() { mongo_eval "db.getSiblingDB('$APP_DB').alert_rule.deleteMany({}).n" >/dev/null; }
insert_rule() {
  local rid body; rid=$(new_oid); body=${1#\{}; body=${body%\}}
  mongo_eval "db.getSiblingDB('$APP_DB').alert_rule.insertOne({_id:ObjectId('$rid'),$body});" >/dev/null
}
clear_rules
insert_rule "{name:'nfr-hc',enabled:true,source:{type:'collection',log_type:'error'},notify:{strategy:'once',url:'http://127.0.0.1:9/hook-nfr'}}"
api_get /notify/sync-alert-rule -H "notify-token: $NOTIFY_TOKEN" -H "appid: $APP_ID" >/dev/null

hc_before_rss=$(rss_kb)
python3 - "$LOG_URL/record" "$APP_ID" "$HC_ERRORS" <<'PY'
import json, random, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

url, appid, n = sys.argv[1], sys.argv[2], int(sys.argv[3])


def send(i):
    mk = f"hc-{i}-{random.randint(0, 10**9)}"
    body = json.dumps({
        "appid": appid,
        "data": [{
            "type": "__BR_COLLECT_ERROR__", "appid": appid,
            "data": {"name": "HighCard", "message": mk, "stack": "st"},
            "uuid": f"u-{mk}", "session": "s",
        }],
    }).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read()).get("code")
    except Exception as exc:  # noqa: BLE001
        return str(exc)


with ThreadPoolExecutor(max_workers=10) as pool:
    results = list(pool.map(send, range(n)))
ok = sum(1 for r in results if r == 0)
print(f"  sent={n} ok={ok}")
PY
sleep 12   # 等一轮 flush 把 fact 落库
hc_after_rss=$(rss_kb)
hc_facts=$(mongo_count "$APP_DB" alert_fact "{}")
echo "  RSS: ${hc_before_rss}KB -> ${hc_after_rss}KB (+$((hc_after_rss - hc_before_rss))KB)"
echo "  alert_fact 文档数: $hc_facts（唯一指纹数 ≈ $HC_ERRORS）"
assert_le "NFR05 高基数错误下 RSS 增量 < 100MB" "$((hc_after_rss - hc_before_rss))" 102400
assert_ge "NFR05 每个唯一指纹都生成了 alert_fact（Once 规则）" "$hc_facts" $((HC_ERRORS * 9 / 10))
clear_rules
api_get /notify/sync-alert-rule -H "notify-token: $NOTIFY_TOKEN" -H "appid: $APP_ID" >/dev/null

summary
