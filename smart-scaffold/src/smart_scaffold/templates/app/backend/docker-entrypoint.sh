#!/bin/sh
# 服務起來之前先把資料庫弄對。失敗就直接退出——帶著錯誤的 schema 跑起來
# 比起不起來更難查。
set -e

echo "→ 套用資料庫 migration"
alembic upgrade head

if [ "${SEED_ON_START:-0}" = "1" ]; then
  echo "→ 建立初始資料（SEED_ON_START=1）"
  python -m app.seed
fi

exec "$@"
