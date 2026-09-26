#!/usr/bin/env bash
# 覆盖补齐：把 A/B/C/D/E 组里前四组脚本没覆盖到的分支单独列出来
# 对应 TEST_CASES.md：API-07/15、ING-04/10/19/20、ALR-13/18/23、FLU-07、ERR-11
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
require_service

section "覆盖补齐：接口/上报/告警/聚合"

APP_ID2="${APP_ID2:-64b7f0c2a1b2c3d4e5f60002}"
APP_DB2="app_${APP_ID2}"
HOOK="http://127.0.0.1:9/hook-cov"

clear_rules() { mongo_eval "db.getSiblingDB('$APP_DB').alert_rule.deleteMany({}).n" >/dev/null; }
insert_rule() {
  local rid body; rid=$(new_oid); body=${1#\{}; body=${body%\}}
  mongo_eval "db.getSiblingDB('$APP_DB').alert_rule.insertOne({_id:ObjectId('$rid'),$body});" >/dev/null
  printf '%s' "$rid"
}
sync_rules() { api_get /notify/sync-alert-rule -H "notify-token: $NOTIFY_TOKEN" -H "appid: $APP_ID"; }
notify_hits() { timeout "${2:-4}" docker exec -i "$KAFKA_CONTAINER" rpk topic consume notify --offset start --format '%v\n' 2>/dev/null; }
notify_count() { notify_hits "$1" | grep -c -F -- "$1"; }

# ============ A 组补齐 ============
# API-07 二进制协议 session 非 UTF-8
st=$(printf '\x00\xff\xfe:%s|payload' "$APP_ID" | curl -sS -m 10 -o "$LAST_BODY" -w '%{http_code}' --data-binary @- "$LOG_URL/record")
assert_eq "API-07 session 非 UTF-8 -> HTTP 200" 200 "$st"
assert_body_code "API-07 session 非 UTF-8 -> code 500" 500

# API-15 并发同 session（当前实现是 find-then-insert，无唯一索引，存在竞态）
conc="conc-$(mark)"
for i in $(seq 20); do
  curl -sS -o /dev/null -H 'Content-Type: application/json' \
    --data-binary "$(payload_v1 __BR_COLLECT_INFO__ "{\"i\":$i}" "$conc-$i" "$conc")" "$LOG_URL/record" &
done
wait
sess_docs=$(mongo_count "$APP_DB" records_session "{session:'$conc'}")
assert_no_bug "API-15 并发同 session 只应 1 条" 1 "$sess_docs" \
  "实测 $sess_docs 条：insert_unique 先 find 再 insert，session 上没有唯一索引，并发会写重复"

# ============ B 组补齐 ============
# ING-04 设备无 X-Real-IP
u="cov04-$(mark)"
st=$(api_post "$(payload_v1 __BR_COLLECT_INFO__ '{"ua":"x"}' "$u" "s-$u")")
assert_eq "ING-04 无 X-Real-IP -> HTTP 200" 200 "$st"
assert_eq "ING-04 ip 落库为 null" "true" "$(mongo_field "$APP_DB" records_device "{uuid:'$u'}" 'd.ip === null')"

# ING-10 小程序 track（__BR_TRACK_EVENT__）
u="cov10-$(mark)"
st=$(api_post "$(payload_v1 __BR_TRACK_EVENT__ "{\"m\":\"$u\"}" "$u" "s-$u")")
assert_eq "ING-10 __BR_TRACK_EVENT__ -> HTTP 200" 200 "$st"
if kafka_has rrweb "$u" 10; then ok "ING-10 小程序 track 进 Kafka"; else bad "ING-10 小程序 track 进 Kafka" "收到含 $u 的消息" "未收到"; fi

# ING-19 data 非对象 -> 包成 {"msg": value}
u="cov19-$(mark)"
st=$(api_post "{\"type\":\"my_log\",\"appid\":\"$APP_ID\",\"data\":123,\"uuid\":\"$u\",\"session\":\"s\"}")
assert_eq "ING-19 data 非对象 -> HTTP 200" 200 "$st"
assert_eq "ING-19 非对象被包成 {msg:123}" 123 "$(mongo_field "$APP_DB" records_log "{uuid:'$u'}" 'Number(d.data.msg)')"

# ING-20 time/stamp 可选字段
u="cov20-$(mark)"
st=$(api_post "{\"type\":\"my_log\",\"appid\":\"$APP_ID\",\"data\":{},\"uuid\":\"$u\",\"session\":\"s\",\"time\":\"2026-01-01 00:00:00\",\"stamp\":123.5}")
assert_eq "ING-20 带 time/stamp -> HTTP 200" 200 "$st"
assert_eq "ING-20 device_time 落库" "2026-01-01 00:00:00" "$(mongo_field "$APP_DB" records_log "{uuid:'$u'}" 'd.device_time')"
assert_eq "ING-20 stamp 落库" 123.5 "$(mongo_field "$APP_DB" records_log "{uuid:'$u'}" 'd.stamp')"
u2="cov20b-$(mark)"
api_post "{\"type\":\"my_log\",\"appid\":\"$APP_ID\",\"data\":{},\"uuid\":\"$u2\",\"session\":\"s\"}" >/dev/null
assert_eq "ING-20 不带 time/stamp 时为 null" "true" \
  "$(mongo_field "$APP_DB" records_log "{uuid:'$u2'}" 'd.device_time === null && d.stamp === null')"

# ING-21 session 幂等（串行）
sid="cov21-$(mark)"
api_post "$(payload_v1 __BR_COLLECT_INFO__ '{}' "cov21a-$(mark)" "$sid")" >/dev/null
api_post "$(payload_v1 __BR_COLLECT_INFO__ '{}' "cov21b-$(mark)" "$sid")" >/dev/null
assert_eq "ING-21 串行同 session 只 1 条" 1 "$(mongo_count "$APP_DB" records_session "{session:'$sid'}")"

# ING-22 指纹算法精确值：md5(name + " " + message + " " + 归一化 stack)
u="cov22-$(mark)"; msg="boom-$u"
st=$(api_post "$(payload_error TypeError "$msg" 'at f (a.js:12:34)\n?token=abc' "$u" "s-$u")")
assert_eq "ING-22 上报 -> HTTP 200" 200 "$st"
expected_fp=$(printf '%s' "TypeError $msg at f (a.js:{line}:{col})
?{query}" | md5sum | awk '{print toupper($1)}')
assert_eq "ING-22 fingerprint == MD5(name message 归一化stack)" "$expected_fp" \
  "$(mongo_field "$APP_DB" records_err "{uuid:'$u'}" 'd.fingerprint')"

# ING-23 is_delete=true 的应用仍可上报（当前行为）
mongo_eval "db.getSiblingDB('reporter').apps.replaceOne({_id:ObjectId('$APP_ID2')},{_id:ObjectId('$APP_ID2'),name:'deleted-app',is_delete:true},{upsert:true});" >/dev/null
u="cov23-$(mark)"
st=$(curl -sS -m 20 -o "$LAST_BODY" -w '%{http_code}' -H 'Content-Type: application/json' \
  --data-binary "{\"type\":\"my_log\",\"appid\":\"$APP_ID2\",\"data\":{},\"uuid\":\"$u\",\"session\":\"s\"}" "$LOG_URL/record")
assert_eq "ING-23 is_delete 应用上报 -> HTTP 200" 200 "$st"
assert_eq "ING-23 当前实现忽略 is_delete，仍然入库" 1 "$(mongo_count "$APP_DB2" records_log "{uuid:'$u'}")"

# ============ C 组补齐 ============
# ALR-13 collection 规则 log_type=api 不应命中 error
clear_rules
insert_rule "{name:'t-api',enabled:true,source:{type:'collection',log_type:'api'},notify:{strategy:'once',url:'$HOOK'}}" >/dev/null
sync_rules >/dev/null
mk=$(mark)
item=$(payload_error ApiRule "apirule-$mk" 'st' "u-$mk" "s-$mk")
api_post "$(payload_v2 "$item")" >/dev/null
fp=$(mongo_field "$APP_DB" records_err "{uuid:'u-$mk'}" 'd.fingerprint')
assert_eq "ALR-26 log_type=api 规则不命中错误" 0 "$(notify_count "$fp")"
sleep 12   # 等一个 flush 周期，确认确实没有 fact
assert_eq "ALR-26 也不产生 alert_fact" 0 "$(mongo_count "$APP_DB" alert_fact "{fingerprint:'$fp'}")"

# ALR-23 enabled=false 的规则不生效
clear_rules
insert_rule "{name:'t-off',enabled:false,source:{type:'collection',log_type:'error'},notify:{strategy:'once',url:'$HOOK'}}" >/dev/null
sync_rules >/dev/null
mk=$(mark)
item=$(payload_error DisabledRule "off-$mk" 'st' "u-$mk" "s-$mk")
api_post "$(payload_v2 "$item")" >/dev/null
fp=$(mongo_field "$APP_DB" records_err "{uuid:'u-$mk'}" 'd.fingerprint')
assert_eq "ALR-23 enabled=false 不告警" 0 "$(notify_count "$fp")"
sleep 12
assert_eq "ALR-23 enabled=false 也不产生 alert_fact" 0 "$(mongo_count "$APP_DB" alert_fact "{fingerprint:'$fp'}")"

# ALR-18b 通知消息字段完整性
clear_rules
insert_rule "{name:'t-cov',enabled:true,source:{type:'collection',log_type:'error'},notify:{strategy:'once',url:'$HOOK'}}" >/dev/null
sync_rules >/dev/null
mk=$(mark)
item=$(payload_error NotifyShape "shape-$mk" 'st' "u-$mk" "s-$mk")
api_post "$(payload_v2 "$item")" >/dev/null
sleep 1
fp=$(mongo_field "$APP_DB" records_err "{uuid:'u-$mk'}" 'd.fingerprint')
line=$(notify_hits "$fp" | grep -F -- "$fp" | sed -n '1p')
assert_contains "ALR-18b notify.type 为人类可读类型" "$line" '"type":"错误日志"'
assert_contains "ALR-18b notify.name 为规则名" "$line" '"name":"t-cov"'
assert_contains "ALR-18b notify.fact 含 count" "$line" '"count":1'
assert_contains "ALR-18b notify.rule 含 strategy" "$line" '"strategy":"once"'
assert_contains "ALR-18b notify.content 含摘要" "$line" "shape-$mk"

# ALR-24 分组规则：uuid 模式 + <UUID> 归一化
clear_rules
rid=$(insert_rule "{name:'t-uuid',enabled:true,source:{type:'group',condition:[{type:'literal',value:'session'},{type:'uuid'}]},notify:{strategy:'once',url:'$HOOK'}}")
sync_rules >/dev/null
mk=$(mark); uuidtok="417eaf98db47df984cdb0fff9f846f86"
item=$(payload_error UuidRule "session $uuidtok leaked $mk" "st-$mk" "u-$mk" "s-$mk")
api_post "$(payload_v2 "$item")" >/dev/null
exp_group_fp=$(printf '%s' "$rid" | md5sum | awk '{print toupper($1)}')
assert_eq "ALR-24 uuid 分组命中 -> 指纹为规则 id 的 MD5" "$exp_group_fp" \
  "$(mongo_field "$APP_DB" records_err "{uuid:'u-$mk'}" 'd.fingerprint')"
wait_count "$APP_DB" history_error "{fingerprint:'$exp_group_fp'}" 1 30 "ALR-24 分组摘要落库"
assert_contains "ALR-24 摘要中 UUID 被归一化为 <UUID>" \
  "$(mongo_field "$APP_DB" history_error "{fingerprint:'$exp_group_fp'}" 'd.summary')" "<UUID>"

# ALR-25 分组未命中时回落 md5 指纹
mk=$(mark)
item=$(payload_error MissRule "unrelated-$mk" 'st' "u-$mk" "s-$mk")
api_post "$(payload_v2 "$item")" >/dev/null
fp=$(mongo_field "$APP_DB" records_err "{uuid:'u-$mk'}" 'd.fingerprint')
if [ "$fp" != "$exp_group_fp" ] && [ "${#fp}" = 32 ]; then
  ok "ALR-25 分组未命中 -> 回落 md5 指纹"
else
  bad "ALR-25 分组未命中 -> 回落 md5 指纹" "32 位 md5 且 != $exp_group_fp" "$fp"
fi
clear_rules; sync_rules >/dev/null

# ALR-22 单条规则文档字段类型错误 -> 整份规则同步失败
clear_rules
mongo_eval "db.getSiblingDB('$APP_DB').alert_rule.insertOne({_id:ObjectId('$(new_oid)'),name:'t-bad',enabled:true,source:{type:'collection',log_type:'error'},notify:{strategy:'limit',url:'$HOOK',limit:3,window_sec:60}});" >/dev/null
st=$(sync_rules)
assert_eq "ALR-22 规则里 limit 是 double -> HTTP 200" 200 "$st"
assert_body_code "ALR-22 类型不匹配导致整份规则同步失败（code 500）" 500
clear_rules
insert_rule "{name:'t-good',enabled:true,source:{type:'collection',log_type:'error'},notify:{strategy:'limit',url:'$HOOK',limit:NumberInt(3),window_sec:NumberInt(60)}}" >/dev/null
st=$(sync_rules)
assert_body_code "ALR-22 修正为 int 后同步恢复（code 0）" 0
clear_rules; sync_rules >/dev/null

# ============ D 组补齐 ============
# FLU-11 聚合字段映射：name/message/page
mk=$(mark)
item=$(printf '{"type":"__BR_COLLECT_ERROR__","appid":"%s","data":{"name":"PageErr","message":"page-%s","stack":"st","page":"/home"},"uuid":"u-%s","session":"s"}' "$APP_ID" "$mk" "$mk")
api_post "$(payload_v2 "$item")" >/dev/null
fp=$(mongo_field "$APP_DB" records_err "{uuid:'u-$mk'}" 'd.fingerprint')
wait_count "$APP_DB" history_error "{fingerprint:'$fp'}" 1 30 "FLU-11 带 page 的错误聚合落库"
assert_eq "FLU-11 history_error.name" "PageErr" "$(mongo_field "$APP_DB" history_error "{fingerprint:'$fp'}" 'd.name')"
assert_eq "FLU-11 history_error.message" "page-$mk" "$(mongo_field "$APP_DB" history_error "{fingerprint:'$fp'}" 'd.message')"
assert_eq "FLU-11 history_error.page" "/home" "$(mongo_field "$APP_DB" history_error "{fingerprint:'$fp'}" 'd.page')"

mk=$(mark)
item=$(payload_error NoPage "nopage-$mk" 'st' "u-$mk" "s-$mk")
api_post "$(payload_v2 "$item")" >/dev/null
fp=$(mongo_field "$APP_DB" records_err "{uuid:'u-$mk'}" 'd.fingerprint')
wait_count "$APP_DB" history_error "{fingerprint:'$fp'}" 1 30 "FLU-11 无 page 的错误聚合落库"
assert_eq "FLU-11 无 page 时存空字符串" "true" \
  "$(mongo_field "$APP_DB" history_error "{fingerprint:'$fp'}" 'd.page === ""')"

# FLU-08 重启后从 DB 加载 alert_fact：Once 不会重复告警
clear_rules
insert_rule "{name:'t-boot',enabled:true,source:{type:'collection',log_type:'error'},notify:{strategy:'once',url:'$HOOK'}}" >/dev/null
sync_rules >/dev/null
mk=$(mark)
item=$(payload_error BootLoad "boot-$mk" 'st' "u-$mk" "s-$mk")
body=$(payload_v2 "$item")
api_post "$body" >/dev/null
fp=$(mongo_field "$APP_DB" records_err "{uuid:'u-$mk'}" 'd.fingerprint')
wait_count "$APP_DB" alert_fact "{fingerprint:'$fp'}" 1 30 "FLU-08 重启前 alert_fact 已落库"
before=$(notify_count "$fp")
assert_ge "FLU-08 重启前已推送过 1 条" "$before" 1
bash "$TEST_DIR/service.sh" restart >/dev/null
api_post "$body" >/dev/null
sleep 1
after=$(notify_count "$fp")
assert_eq "FLU-08 重启后同一指纹不再重复告警" "$before" "$after"
assert_eq "FLU-08 重启后规则从 DB 恢复（无规则也写 history_error）" 1 \
  "$(mongo_count "$APP_DB" history_error "{fingerprint:'$fp'}")"

# ============ E 组补齐 ============
# ERR-11 缺少必需环境变量时启动即失败
out=$(env -i PATH="$PATH" timeout 15 "$SERVICE_BIN" 2>&1)
st=$?
if [ "$st" != "0" ]; then
  ok "ERR-11 缺环境变量 -> 进程非 0 退出"
else
  bad "ERR-11 缺环境变量 -> 进程非 0 退出" "非 0" "$st"
fi
assert_contains "ERR-11 报错信息提示缺失环境变量" "$out" "enviroment missing"

summary
