#!/usr/bin/env bash
# 一键执行全部默认用例；故障注入与压测需显式开启
#   RUN_FAULTS=1 RUN_NFR=1 scripts/logs-test/run-all.sh
set -uo pipefail
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

failed=0
for case in 01_api 02_ingest 03_alert 04_flush 07_matrix; do
  bash "$TEST_DIR/cases/$case.sh" || failed=1
done

if [ "${RUN_FAULTS:-0}" = "1" ]; then
  bash "$TEST_DIR/cases/05_faults.sh" || failed=1
else
  echo
  echo "已跳过 05_faults.sh（RUN_FAULTS=1 开启）"
fi

if [ "${RUN_NFR:-0}" = "1" ]; then
  bash "$TEST_DIR/cases/06_nfr.sh" || failed=1
else
  echo "已跳过 06_nfr.sh（RUN_NFR=1 开启）"
fi

echo
if [ "$failed" = 0 ]; then
  echo "全部通过"
else
  echo "存在失败用例，详见上方输出"
fi
exit "$failed"
