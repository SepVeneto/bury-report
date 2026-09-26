#!/usr/bin/env bash
# D 组：聚合与 flush（对应 TEST_CASES.md D 组）
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
require_service

section "D. 聚合与 flush"

HOOK="http://127.0.0.1:9/hook-d"
clear_rules() { mongo_eval "db.getSiblingDB('$APP_DB').alert_rule.deleteMany({}).n" >/dev/null; }
insert_rule() { # 去掉规则体外层大括号后与 _id 合并成一个文档
  local rid body; rid=$(new_oid); body=${1#\{}; body=${body%\}}
  mongo_eval "db.getSiblingDB('$APP_DB').alert_rule.insertOne({_id:ObjectId('$rid'),$body});" >/dev/null
  printf '%s' "$rid"
}
sync_rules() { api_get /notify/sync-alert-rule -H "notify-token: $NOTIFY_TOKEN" -H "appid: $APP_ID" >/dev/null; }

# ---- D/FLU-04 无规则也写 history_error ----
clear_rules; sync_rules
mk=$(mark)
item=$(payload_error NoRule "norule-$mk" 'at f (a.js:1:2)' "u-$mk" "s-$mk")
api_post "$(payload_v2 "$item")" >/dev/null
fp=$(mongo_scalar "print(db.getSiblingDB('$APP_DB').records_err.findOne({uuid:'u-$mk'}).fingerprint)")
wait_count "$APP_DB" history_error "{fingerprint:'$fp'}" 1 30 "D04 无规则也写入 history_error"
assert_eq "D04 rule_id 为 null" "true" "$(mongo_field "$APP_DB" history_error "{fingerprint:'$fp'}" 'd.rule_id === null')"
assert_eq "D04 保存了 summary" "string" "$(mongo_field "$APP_DB" history_error "{fingerprint:'$fp'}" 'typeof d.summary')"

# ---- D/FLU-01/02 count 累加 & first_seen 不变 ----
first_seen=$(mongo_field "$APP_DB" history_error "{fingerprint:'$fp'}" 'd.first_seen.getTime()')
body=$(payload_v2 "$item")
api_post "$body" >/dev/null
wait_count "$APP_DB" history_error "{fingerprint:'$fp',count:{\$gte:2}}" 1 30 "D01 第二轮 flush 后 count >= 2"
assert_eq "D02 first_seen 不被后续 flush 改写" "$first_seen" \
  "$(mongo_field "$APP_DB" history_error "{fingerprint:'$fp'}" 'd.first_seen.getTime()')"

# ---- D/FLU-05 alert_fact 字段 ----
clear_rules
insert_rule "{name:'t-d',enabled:true,source:{type:'fingerprint',fingerprint:'$fp'},notify:{strategy:'once',url:'$HOOK'}}" >/dev/null
sync_rules
api_post "$body" >/dev/null
wait_count "$APP_DB" alert_fact "{fingerprint:'$fp'}" 1 30 "D05 alert_fact 落库"
for f in fingerprint strategy ttl last_seen last_notify count; do
  assert_eq "D05 alert_fact 含字段 $f" "true" "$(mongo_has "$APP_DB" alert_fact "{fingerprint:'$fp'}" "$f")"
done

# ---- D/FLU-03 rule_id 会被本轮未命中覆盖为 null ----
clear_rules; sync_rules
api_post "$(payload_v2 "$item")" >/dev/null
sleep 12
assert_eq "D03 规则下线后 rule_id 被覆盖为 null（当前行为）" "true" \
  "$(mongo_field "$APP_DB" history_error "{fingerprint:'$fp'}" 'd.rule_id === null')"

# ---- D/FLU-06/08/09/10：内存态与性能观测，见 06_nfr.sh ----
skip "D06 fact 内存过期：由 C16(Window 重推)/NFR 组覆盖"
skip "D08 启动全量加载 alert_fact：需构造大量历史数据，归入压测"
skip "D09 窗口清空丢计数 / D10 单轮串行写：属于性能观测，见 06_nfr.sh"

summary
