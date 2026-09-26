#!/usr/bin/env bash
# 停止被测服务与依赖容器，并清理数据
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

if service_running; then
  bash "$TEST_DIR/service.sh" stop
fi

$COMPOSE down -v --remove-orphans

echo "已清理。日志与临时文件保留在 $RUN_DIR"
