#!/usr/bin/env bash
# B 组：上报类型 -> 落库/转发映射（对应 TEST_CASES.md B 组）
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
require_service

section "B. 上报类型 -> 落库/转发映射"

# ---- B/ING-01 设备首次上报 ----
u="d-ing01-$(mark)"
st=$(api_post "$(payload_v1 __BR_COLLECT_INFO__ '{"ua":"okhttp"}' "$u" "s-ing01")" -H 'X-Real-IP: 1.2.3.4')
assert_eq "B01 设备上报 -> HTTP 200" 200 "$st"
assert_eq "B01 写入 records_device" 1 "$(mongo_count "$APP_DB" records_device "{uuid:'$u'}")"
assert_eq "B01 记录 X-Real-IP" "1.2.3.4" "$(mongo_field "$APP_DB" records_device "{uuid:'$u'}" 'd.ip')"
assert_eq "B01 写入 records_session" 1 "$(mongo_count "$APP_DB" records_session "{session:'s-ing01'}")"

# ---- B/ING-02 同 uuid 重复上报（幂等） ----
st=$(api_post "$(payload_v1 __BR_COLLECT_INFO__ '{"ua":"updated"}' "$u" "s-ing01")")
assert_eq "B02 设备重复上报 -> HTTP 200" 200 "$st"
assert_eq "B02 records_device 不重复" 1 "$(mongo_count "$APP_DB" records_device "{uuid:'$u'}")"
assert_eq "B02 data 被更新" "updated" "$(mongo_field "$APP_DB" records_device "{uuid:'$u'}" 'd.data.ua')"

# ---- B/ING-03 设备无 session ----
u="d-ing03-$(mark)"
st=$(api_post "{\"type\":\"__BR_COLLECT_INFO__\",\"appid\":\"$APP_ID\",\"data\":{\"ua\":\"x\"},\"uuid\":\"$u\"}")
assert_eq "B03 无 session 设备上报 -> HTTP 200" 200 "$st"
assert_eq "B03 仍写 records_device" 1 "$(mongo_count "$APP_DB" records_device "{uuid:'$u'}")"
assert_eq "B03 不写 records_session" 0 "$(mongo_count "$APP_DB" records_session "{uuid:'$u'}")"

# ---- B/ING-05 网络日志 ----
u="d-ing05-$(mark)"
st=$(api_post "$(payload_v1 __BR_API__ '{"url":"/api/x"}' "$u" "s-ing05")")
assert_eq "B05 网络日志 -> HTTP 200" 200 "$st"
assert_eq "B05 写入 records_api" 1 "$(mongo_count "$APP_DB" records_api "{uuid:'$u'}")"

# ---- B/ING-06 错误日志 ----
u="d-ing06-$(mark)"; msg="b06 $u"
st=$(api_post "$(payload_error B06 "$msg" 'at f (a.js:1:2)' "$u" "s-ing06")")
assert_eq "B06 错误日志 -> HTTP 200" 200 "$st"
assert_eq "B06 写入 records_err" 1 "$(mongo_count "$APP_DB" records_err "{uuid:'$u'}")"
fp=$(mongo_field "$APP_DB" records_err "{uuid:'$u'}" 'd.fingerprint')
assert_eq "B06 计算 fingerprint（32 位）" 32 "${#fp}"
assert_eq "B06 summary 不落库" "false" "$(mongo_has "$APP_DB" records_err "{uuid:'$u'}" summary)"

# ---- B/ING-07 自定义日志 ----
u="d-ing07-$(mark)"
st=$(api_post "$(payload_v1 my_custom '{"a":1}' "$u" "s-ing07")")
assert_eq "B07 自定义日志 -> HTTP 200" 200 "$st"
assert_eq "B07 写入 records_log" 1 "$(mongo_count "$APP_DB" records_log "{uuid:'$u'}")"

# ---- B/ING-08/09 track ----
u="d-ing08-$(mark)"
st=$(api_post "$(payload_v1 __BR_TRACK__ '{"e":"tap"}' "$u" "s-ing08-$u")")
assert_eq "B08 track 上报 -> HTTP 200" 200 "$st"
if kafka_has rrweb "$u"; then ok "B08 track 进 Kafka rrweb"; else bad "B08 track 进 Kafka rrweb" "收到含 $u 的消息" "未收到"; fi
assert_eq "B08 track 不落库" 0 "$(mongo_count "$APP_DB" records_log "{uuid:'$u'}")"

u="d-ing09-$(mark)"
st=$(api_post "{\"type\":\"__BR_TRACK__\",\"appid\":\"$APP_ID\",\"data\":{\"e\":\"tap\"},\"uuid\":\"$u\"}")
assert_eq "B09 无 session 的 track -> HTTP 200" 200 "$st"
if kafka_none rrweb 6; then ok "B09 无 session 的 track 被静默丢弃"; else bad "B09 无 session 的 track 被静默丢弃" "无新消息" "有消息"; fi

# ---- B/ING-11~13 custom id ----
exp_id=$(printf '%s' "user-123-$SALT" | md5sum | awk '{print toupper($1)}')
u1="d-ing11-$(mark)"; u2="d-ing12-$(mark)"
st=$(api_post "$(payload_v1 __BR_CUSTOM_ID__ '{"id":"user-123"}' "$u1" "s-ing11")")
assert_eq "B11 custom id -> HTTP 200" 200 "$st"
assert_eq "B11 id 为加盐 MD5" "$exp_id" "$(mongo_field "$APP_DB" records_custom_id "{id:'$exp_id'}" 'd.id')"
assert_contains "B11 device 数组含本次 uuid" "$(mongo_field "$APP_DB" records_custom_id "{id:'$exp_id'}" 'd.device.join(",")')" "$u1"

st=$(api_post "$(payload_v1 __BR_CUSTOM_ID__ '{"id":"user-123"}' "$u2" "s-ing12")")
assert_eq "B12 同 id 重复上报 -> HTTP 200" 200 "$st"
assert_eq "B12 仅 1 条文档" 1 "$(mongo_count "$APP_DB" records_custom_id "{id:'$exp_id'}")"
assert_eq "B12 device 去重累加为 2" 2 "$(mongo_field "$APP_DB" records_custom_id "{id:'$exp_id'}" 'd.device.length')"

u3="d-ing13-$(mark)"
st=$(api_post "{\"type\":\"__BR_CUSTOM_ID__\",\"appid\":\"$APP_ID\",\"data\":{\"id\":\"user-456\"},\"uuid\":\"$u3\"}")
exp_id6=$(printf '%s' "user-456-$SALT" | md5sum | awk '{print toupper($1)}')
assert_eq "B13 无 session 时不往数组写 null" "0" \
  "$(mongo_field "$APP_DB" records_custom_id "{id:'$exp_id6'}" '(d.session ? d.session.filter(function(x){return x === null}).length : 0)')"

# ---- B/ING-14/16/17 V2 批量 ----
mk=$(mark)
d1="v2-dev-$mk"; d2="v2-net-$mk"; d3="v2-err-$mk"; d4="v2-trk-$mk"; d5="v2-log-$mk"
items="$(payload_v1 __BR_COLLECT_INFO__ '{"ua":"v2"}' "$d1" "s-v2-$mk"),"
items+="$(payload_v1 __BR_API__ '{"url":"/v2"}' "$d2" "s-v2-$mk"),"
items+="$(payload_error V2 "$mk" 'at g (b.js:3:4)' "$d3" "s-v2-$mk"),"
items+="$(payload_v1 __BR_TRACK__ "{\"mark\":\"$mk\"}" "$d4" "s-v2-$mk"),"
items+="$(payload_v1 my_custom "{\"mark\":\"$mk\"}" "$d5" "s-v2-$mk")"
st=$(api_post "$(payload_v2 "$items")")
assert_eq "B14 V2 批量混合上报 -> HTTP 200" 200 "$st"
assert_body_code "B14 body.code = 0" 0
assert_eq "B14 device 落库" 1 "$(mongo_count "$APP_DB" records_device "{uuid:'$d1'}")"
assert_eq "B14 network 落库" 1 "$(mongo_count "$APP_DB" records_api "{uuid:'$d2'}")"
assert_eq "B14 error 落库" 1 "$(mongo_count "$APP_DB" records_err "{uuid:'$d3'}")"
assert_eq "B14 custom 落库" 1 "$(mongo_count "$APP_DB" records_log "{uuid:'$d5'}")"
if kafka_has rrweb "$mk"; then ok "B14 track 进 Kafka"; else bad "B14 track 进 Kafka" "收到含 $mk 的消息" "未收到"; fi

# B15 空 data
st=$(api_post "$(payload_v2 '')")
assert_eq "B15 V2 空 data -> HTTP 200" 200 "$st"
assert_body_code "B15 V2 空 data -> code 0" 0

# B16 item.appid 与 v2.appid 不一致
other="000000000000000000000009"; u="d-ing16-$(mark)"
item=$(printf '{"type":"my_log","appid":"%s","data":{},"uuid":"%s","session":"s"}' "$other" "$u")
st=$(api_post "$(payload_v2 "$item")")
assert_eq "B16 appid 不一致 -> HTTP 200" 200 "$st"
assert_eq "B16 文档 appid 统一为 v2.appid（与所在库一致）" "$APP_ID" \
  "$(mongo_field "$APP_DB" records_log "{uuid:'$u'}" 'd.appid')"

summary
