#!/usr/bin/env bash
# C 组：告警规则、指纹与通知（对应 TEST_CASES.md C 组）
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
require_service

section "C. 告警规则、指纹与通知"

HOOK_A="http://127.0.0.1:9/hook-a"
HOOK_B="http://127.0.0.1:9/hook-b"

clear_rules() { mongo_eval "db.getSiblingDB('$APP_DB').alert_rule.deleteMany({}).n" >/dev/null; }
insert_rule() { # 显式指定 _id，避免依赖 mongo shell 的 ObjectId 输出格式；回显 hex id
  local rid body; rid=$(new_oid)
  body=${1#\{}; body=${body%\}}          # 去掉规则体外层大括号
  mongo_eval "db.getSiblingDB('$APP_DB').alert_rule.insertOne({_id:ObjectId('$rid'),$body});" >/dev/null
  printf '%s' "$rid"
}
sync_rules() { api_get /notify/sync-alert-rule -H "notify-token: $NOTIFY_TOKEN" -H "appid: $APP_ID"; }
notify_dump() { timeout "${2:-4}" docker exec -i "$KAFKA_CONTAINER" rpk topic consume notify --offset start --format '%v\n' 2>/dev/null; }
notify_count() { notify_dump "$1" | grep -c -F -- "$1"; }
notify_lines() { notify_dump "$1" | grep -F -- "$1" | sed -n '1p'; }
fingerprint_of() { # uuid -> records_err.fingerprint
  mongo_scalar "print(db.getSiblingDB('$APP_DB').records_err.findOne({uuid:'$1'}).fingerprint)"
}
post_error_v2() { # name message stack -> 上报一条 V2 错误
  local mk; mk=$(mark)
  local item; item=$(payload_error "$1" "$2" "$3" "u-$mk" "s-$mk")
  api_post "$(payload_v2 "$item")" >/dev/null
}

# ---- C/ALR-01 规则同步 ----
clear_rules
insert_rule "{name:'t-once',enabled:true,source:{type:'collection',log_type:'error'},notify:{strategy:'once',url:'$HOOK_A'}}" >/dev/null
st=$(sync_rules)
assert_eq "C01 同步规则 -> HTTP 200" 200 "$st"
assert_body_code "C01 同步规则 -> code 0" 0

# ---- C/ALR-02/03 token 校验（当前实现无反馈） ----
st=$(api_get /notify/sync-alert-rule -H "notify-token: wrong-token" -H "appid: $APP_ID")
assert_eq "C02 错误 token -> HTTP 200" 200 "$st"
assert_body_code "C02 错误 token 仍返回 code 0（当前行为）" 0
st=$(api_get /notify/sync-alert-rule -H "appid: $APP_ID")
assert_eq "C03 缺 token 头 -> HTTP 200" 200 "$st"
assert_body_code "C03 缺 token 头仍返回 code 0（当前行为）" 0

# ---- C/ALR-04 appid 头缺失 ----
st=$(api_get /notify/sync-alert-rule -H "notify-token: $NOTIFY_TOKEN")
assert_body_code "C04 缺 appid 头 -> code 500" 500

# ---- C/ALR-15 Once 策略只推一次 ----
mk=$(mark); msg="once-$mk"
item=$(payload_error TypeError "$msg" 'at f (a.js:1:2)' "u-$mk" "s-$mk")
body=$(payload_v2 "$item")
api_post "$body" >/dev/null
fp=$(fingerprint_of "u-$mk")
wait_count "$APP_DB" alert_fact "{fingerprint:'$fp'}" 1 30 "C15 alert_fact 落库 1 条"
assert_eq "C15 首次触发 ttl 硬编码为 7 天" 604800 "$(mongo_field "$APP_DB" alert_fact "{fingerprint:'$fp'}" 'Number(d.ttl)')"
assert_eq "C15 strategy=once" once "$(mongo_field "$APP_DB" alert_fact "{fingerprint:'$fp'}" 'd.strategy')"

# 第二次出现：and_modify 用 rule.ttl()(=None for Once) 覆盖 ttl -> 该 fact 永不回收
api_post "$body" >/dev/null
ttl_state=""
for _ in $(seq 30); do
  ttl_state=$(mongo_field "$APP_DB" alert_fact "{fingerprint:'$fp'}" 'd.ttl === null')
  [ "$ttl_state" = "true" ] && break
  sleep 1
done
assert_eq "C15 第二次出现后 ttl 被清空 -> fact 永不回收（当前行为缺陷）" "true" "$ttl_state"
assert_eq "C15 Once 即使多次出现 -> notify 只 1 条" 1 "$(notify_count "$fp")"

# ---- C/ALR-18 通知内容 ----
line=$(notify_lines "$fp")
assert_contains "C18 notify 含 strategy=once" "$line" '"strategy":"once"'
assert_contains "C18 notify 含触发摘要" "$line" "$msg"
assert_contains "C18 notify 含规则 url" "$line" "$HOOK_A"

# ---- C/ALR-14 规则无 url 不告警 ----
clear_rules
insert_rule "{name:'t-nourl',enabled:true,source:{type:'collection',log_type:'error'},notify:{strategy:'once',url:null}}" >/dev/null
sync_rules >/dev/null
mk=$(mark)
post_error_v2 NoUrl "nourl-$mk" 'at f (a.js:1:2)'
fp=$(fingerprint_of "u-$mk")
assert_eq "C14 规则无 url -> notify 0 条" 0 "$(notify_count "$fp")"
sleep 12   # 等一个 flush 周期，确认确实没有 fact
assert_eq "C14 规则无 url -> alert_fact 0 条" 0 "$(mongo_count "$APP_DB" alert_fact "{fingerprint:'$fp'}")"

# ---- C/ALR-17 Limit 策略只推一次（当前实现缺陷） ----
clear_rules
insert_rule "{name:'t-limit',enabled:true,source:{type:'collection',log_type:'error'},notify:{strategy:'limit',url:'$HOOK_B',limit:NumberInt(3),window_sec:NumberInt(60)}}" >/dev/null
sync_rules >/dev/null
mk=$(mark)
item=$(payload_error LimitBug "limit-$mk" 'at f (a.js:1:2)' "u-$mk" "s-$mk")
body=$(payload_v2 "$item")
for _ in $(seq 6); do api_post "$body" >/dev/null; sleep 0.2; done
fp=$(fingerprint_of "u-$mk")
assert_eq "C17 limit=3 连续 6 次 -> 只推 1 条（当前行为）" 1 "$(notify_count "$fp")"

# ---- C/ALR-16 Window 策略：窗口内不推 ----
clear_rules
insert_rule "{name:'t-window',enabled:true,source:{type:'collection',log_type:'error'},notify:{strategy:'window',url:'$HOOK_B',window_sec:NumberInt(60)}}" >/dev/null
sync_rules >/dev/null
mk=$(mark)
item=$(payload_error WindowRule "window-$mk" 'at f (a.js:1:2)' "u-$mk" "s-$mk")
body=$(payload_v2 "$item")
for _ in 1 2 3; do api_post "$body" >/dev/null; sleep 0.2; done
fp=$(fingerprint_of "u-$mk")
assert_eq "C16 窗口期内连续 3 次 -> 只 1 条" 1 "$(notify_count "$fp")"

# ---- C/ALR-16b 静默超过窗口后重推 ----
clear_rules
insert_rule "{name:'t-window2',enabled:true,source:{type:'collection',log_type:'error'},notify:{strategy:'window',url:'$HOOK_B',window_sec:NumberInt(2)}}" >/dev/null
sync_rules >/dev/null
mk=$(mark)
item=$(payload_error WindowRule2 "win2-$mk" 'at f (a.js:1:2)' "u-$mk" "s-$mk")
body=$(payload_v2 "$item")
api_post "$body" >/dev/null
# 等 GC 把 fact 回收（无出现 > window_sec 且至少一个 10s flush 周期）
sleep 12
api_post "$body" >/dev/null
sleep 0.5
fp=$(fingerprint_of "u-$mk")
assert_eq "C16b 静默超过 window_sec 且 fact 被回收后 -> 重推（共 2 条）" 2 "$(notify_count "$fp")"

# ---- C/ALR-20 V1 错误不触发告警 ----
mk=$(mark)
st=$(api_post "$(payload_error V1Path "v1-$mk" 'at f (a.js:1:2)' "u-$mk" "s-$mk")")
assert_eq "C20 V1 错误上报 -> HTTP 200" 200 "$st"
fp=$(fingerprint_of "u-$mk")
assert_eq "C20 V1 错误有 fingerprint 落库" 32 "${#fp}"
assert_eq "C20 V1 错误不产生 notify（当前行为）" 0 "$(notify_count "$fp")"
sleep 1
assert_eq "C20 V1 错误不产生 alert_fact（当前行为）" 0 "$(mongo_count "$APP_DB" alert_fact "{fingerprint:'$fp'}")"

# ---- C/ALR-06 指纹归一化：行列号 ----
clear_rules; sync_rules >/dev/null
mk=$(mark)
item1=$(payload_error SameFp "same-$mk" 'at f (a.js:12:34)' "u1-$mk" "s-$mk")
item2=$(payload_error SameFp "same-$mk" 'at f (a.js:99:7)' "u2-$mk" "s-$mk")
api_post "$(payload_v2 "$item1")" >/dev/null
api_post "$(payload_v2 "$item2")" >/dev/null
fp1=$(fingerprint_of "u1-$mk"); fp2=$(fingerprint_of "u2-$mk")
assert_eq "C06 行列号不同 -> 指纹相同" "$fp1" "$fp2"
wait_count "$APP_DB" history_error "{fingerprint:'$fp1'}" 1 30 "C06 history_error 聚合为 1 条"
assert_ge "C06 聚合 count >= 2" "$(mongo_field "$APP_DB" history_error "{fingerprint:'$fp1'}" 'Number(d.count)')" 2

# ---- C/ALR-07 指纹归一化：query ----
mk=$(mark)
item1=$(payload_error QueryFp "q-$mk" 'at f (a.js:1:2) ?token=aaa' "u1-$mk" "s-$mk")
item2=$(payload_error QueryFp "q-$mk" 'at f (a.js:1:2) ?token=bbb' "u1b-$mk" "s-$mk")
api_post "$(payload_v2 "$item1")" >/dev/null
api_post "$(payload_v2 "$item2")" >/dev/null
assert_eq "C07 query 不同 -> 指纹相同" "$(fingerprint_of "u1-$mk")" "$(fingerprint_of "u1b-$mk")"

# ---- C/ALR-08 不同 message -> 不同指纹 ----
mk=$(mark)
post_error_v2 DiffFp "diff-a-$mk" 'at f (a.js:1:2)'
post_error_v2 DiffFp "diff-b-$mk" 'at f (a.js:1:2)'
fp_a=$(mongo_scalar "print(db.getSiblingDB('$APP_DB').records_err.findOne({'data.message':'diff-a-$mk'}).fingerprint)")
fp_b=$(mongo_scalar "print(db.getSiblingDB('$APP_DB').records_err.findOne({'data.message':'diff-b-$mk'}).fingerprint)")
if [ "$fp_a" != "$fp_b" ] && [ -n "$fp_a" ]; then ok "C08 message 不同 -> 指纹不同"; else bad "C08 message 不同 -> 指纹不同" "两个不同指纹" "$fp_a / $fp_b"; fi

# ---- C/ALR-10 分组规则 ----
clear_rules
rule_id=$(insert_rule "{name:'t-group',enabled:true,source:{type:'group',condition:[{type:'literal',value:'routeDone'},{type:'literal',value:'webviewId'},{type:'number'}]},notify:{strategy:'once',url:'$HOOK_A'}}")
sync_rules >/dev/null
mk=$(mark)
msg="routeDone with a webviewId 42 is not found"
item=$(payload_error GroupRule "$msg" "stack-$mk" "u-$mk" "s-$mk")
api_post "$(payload_v2 "$item")" >/dev/null
expected_fp=$(printf '%s' "$rule_id" | md5sum | awk '{print toupper($1)}')
assert_eq "C10 分组命中 -> 指纹为规则 id 的 MD5" "$expected_fp" "$(fingerprint_of "u-$mk")"
wait_count "$APP_DB" history_error "{fingerprint:'$expected_fp'}" 1 30 "C10 分组摘要落库"
assert_contains "C10 摘要被归一化（数字 -> <NUMBER>）" \
  "$(mongo_field "$APP_DB" history_error "{fingerprint:'$expected_fp'}" 'd.summary')" "<NUMBER>"

# ---- C/ALR-11 规则优先级：fingerprint > collection ----
clear_rules; sync_rules >/dev/null
mk=$(mark)
post_error_v2 Priority "prio-$mk" 'at f (a.js:1:2)'
fp=$(mongo_scalar "print(db.getSiblingDB('$APP_DB').records_err.findOne({'data.message':'prio-$mk'}).fingerprint)")
clear_rules
insert_rule "{name:'t-fp',enabled:true,source:{type:'fingerprint',fingerprint:'$fp'},notify:{strategy:'once',url:'$HOOK_A'}}" >/dev/null
insert_rule "{name:'t-col',enabled:true,source:{type:'collection',log_type:'error'},notify:{strategy:'once',url:'$HOOK_B'}}" >/dev/null
sync_rules >/dev/null
item=$(payload_error Priority "prio-$mk" 'at f (a.js:1:2)' "u2-$mk" "s-$mk")
api_post "$(payload_v2 "$item")" >/dev/null
sleep 1
line=$(notify_lines "$fp" | tail -1)
assert_contains "C11 指纹规则优先命中（url=hook-a）" "$line" "$HOOK_A"
assert_not_contains "C11 未命中 collection 规则（url=hook-b）" "$line" "$HOOK_B"

clear_rules; sync_rules >/dev/null
summary
