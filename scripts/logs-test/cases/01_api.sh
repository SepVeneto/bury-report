#!/usr/bin/env bash
# A 组：接口与协议（对应 TEST_CASES.md A 组）
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
require_service

section "A. 接口与协议"

# A01 正常上报
st=$(api_post "$(payload_v1 my_log '{"k":"v"}' "d-a01-$(mark)" "s-a01")")
assert_eq "A01 合法 V1 上报 -> HTTP 200" 200 "$st"
assert_body_code "A01 body.code = 0" 0

# A02 空 body
st=$(curl -sS -m 10 -o "$LAST_BODY" -w '%{http_code}' --data-binary '' "$LOG_URL/record")
assert_eq "A02 空 body -> HTTP 400" 400 "$st"

# A03 首字节为 1
st=$(printf '\x01abc' | curl -sS -m 10 -o "$LAST_BODY" -w '%{http_code}' --data-binary @- "$LOG_URL/record")
assert_eq "A03 首字节 0x01 -> HTTP 400" 400 "$st"

# A04 二进制协议
mk=$(mark); sess="sess-$mk"
st=$(api_post_raw "$sess" "$APP_ID" "raw-$mk")
assert_eq "A04 二进制协议 -> HTTP 200" 200 "$st"
if kafka_has rrweb "$mk"; then ok "A04 原始数据进 Kafka rrweb"; else bad "A04 原始数据进 Kafka rrweb" "收到含 $mk 的消息" "未收到"; fi

# A05 缺 '|'
st=$(printf '\x00%s:%s%s' "$sess" "$APP_ID" 'no-pipe' | curl -sS -m 10 -o "$LAST_BODY" -w '%{http_code}' --data-binary @- "$LOG_URL/record")
assert_eq "A05 二进制协议缺 '|' -> HTTP 400" 400 "$st"

# A06 缺 ':'
st=$(printf '\x00%s%s|%s' "$sess" "$APP_ID" 'no-colon' | curl -sS -m 10 -o "$LAST_BODY" -w '%{http_code}' --data-binary @- "$LOG_URL/record")
assert_eq "A06 二进制协议缺 ':' -> HTTP 400" 400 "$st"

# A08 二进制协议不校验 appid
mk=$(mark)
st=$(api_post_raw "s-$mk" 'aaaaaaaaaaaaaaaaaaaaaaaa' "unknown-app-$mk")
assert_eq "A08 二进制协议不校验 appid -> HTTP 200" 200 "$st"
if kafka_has rrweb "$mk"; then ok "A08 未知 appid 也被转发到 rrweb"; else bad "A08 未知 appid 也被转发到 rrweb" "收到含 $mk 的消息" "未收到"; fi

# A09 非法 JSON
st=$(api_post '{"foo":1}')
assert_eq "A09 非法 JSON -> HTTP 400" 400 "$st"
assert_body_code "A09 非法 JSON -> body.code = 400" 400

# A10 appid 非法
st=$(api_post '{"type":"my_log","appid":"abc","data":{},"uuid":"u-a10","session":"s-a10"}')
assert_eq "A10 appid 非法 -> HTTP 200" 200 "$st"
assert_body_code "A10 appid 非法 -> body.code = 500" 500

# A11 应用不存在
st=$(api_post '{"type":"my_log","appid":"000000000000000000000000","data":{},"uuid":"u-a11","session":"s-a11"}')
assert_eq "A11 应用不存在 -> HTTP 200" 200 "$st"
assert_body_code "A11 应用不存在 -> body.code = 500" 500
assert_contains "A11 错误信息含【没有对应的应用】" "$(body_message)" "没有对应的应用"

# A12 超大 body：请求体上限现在真正生效
python3 - "$RUN_DIR/big.json" "$APP_ID" <<'PY'
import json, sys
path, appid = sys.argv[1], sys.argv[2]
with open(path, "w") as fh:
    json.dump({"type": "my_log", "appid": appid, "data": {"p": "a" * 30_000_000},
               "uuid": "u-a12", "session": "s-a12"}, fh)
PY
st=$(curl -sS -m 90 -o "$LAST_BODY" -w '%{http_code}' -H 'Content-Type: application/json' \
  --data-binary "@$RUN_DIR/big.json" "$LOG_URL/record")
assert_eq "A12 30MB body -> HTTP 413" 413 "$st"
assert_body_code "A12 30MB body -> body.code = 413" 413

# A12b 略超 10MB 也应被拒
python3 - "$RUN_DIR/big11.json" "$APP_ID" <<'PY'
import json, sys
path, appid = sys.argv[1], sys.argv[2]
with open(path, "w") as fh:
    json.dump({"type": "my_log", "appid": appid, "data": {"p": "a" * 11_000_000},
               "uuid": "u-a12b", "session": "s-a12b"}, fh)
PY
st=$(curl -sS -m 60 -o "$LAST_BODY" -w '%{http_code}' -H 'Content-Type: application/json' \
  --data-binary "@$RUN_DIR/big11.json" "$LOG_URL/record")
assert_eq "A12b 11MB body -> HTTP 413" 413 "$st"

# A13 畸形请求头
out=$(printf 'GET / HTTP/1.1\r\nHost: x\r\nBad Header: y\r\n\r\n' | timeout 5 nc 127.0.0.1 8870 2>/dev/null | head -1)
assert_not_contains "A13 畸形请求头被拒绝（无 200 响应）" "$out" "200 OK"

# A14 /verify_ticket 未注册
st=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' -X POST "$LOG_URL/verify_ticket")
assert_eq "A14 /verify_ticket 未注册 -> HTTP 404" 404 "$st"

summary
