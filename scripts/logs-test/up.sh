#!/usr/bin/env bash
# 启动测试依赖（MongoDB + Redpanda）并准备测试数据
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

section "[1/4] 启动依赖容器"
$COMPOSE up -d || exit 1

section "[2/4] 等待 MongoDB"
for i in $(seq 60); do
  if docker exec "$MONGO_CONTAINER" mongo --quiet --eval 'db.adminCommand({ping:1}).ok' 2>/dev/null | grep -q 1; then
    echo "  mongo ready"
    break
  fi
  [ "$i" = 60 ] && { echo "  mongo 启动超时" >&2; exit 1; }
  sleep 1
done

section "[3/4] 等待 Redpanda"
for i in $(seq 60); do
  if rpk cluster health 2>/dev/null | grep -q 'Healthy: *true'; then
    echo "  redpanda ready"
    break
  fi
  [ "$i" = 60 ] && { echo "  redpanda 启动超时" >&2; exit 1; }
  sleep 1
done
rpk topic create rrweb notify >/dev/null 2>&1 || true

section "[4/4] 准备测试数据"
mongo_eval "
db = db.getSiblingDB('reporter');
db.apps.replaceOne(
  { _id: ObjectId('$APP_ID') },
  { _id: ObjectId('$APP_ID'), name: 'logs-test-app', is_delete: false },
  { upsert: true }
);
admin = db.getSiblingDB('admin');
admin.createUser({ user: 'appuser', pwd: 'appuser_123', roles: [
  { role: 'readWrite', db: 'reporter' },
  { role: 'readWrite', db: '$APP_DB' }
]}).ok;
print('seeded');
" >/dev/null

echo
echo "依赖就绪。下一步："
echo "  scripts/logs-test/service.sh start     # 启动被测服务"
echo "  scripts/logs-test/run-all.sh           # 跑全部用例"
echo
echo "说明："
echo "  - root 账号用于所有用例（服务按 REPORT_DB_URL/DB_NAME/DB_PWD 连接）"
echo "  - appuser 为限定库账号，仅用于手工验证权限相关场景"
