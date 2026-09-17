#!/bin/sh
# 服務起來之前先把資料庫弄好。建表可以重複執行，所以每次啟動都跑一次。
set -e

echo "→ 建立資料表"
python -m {{name}} init

if [ "${SEED_ON_START:-0}" = "1" ]; then
  echo "→ 建立初始資料（SEED_ON_START=1）"
  python -m {{name}} seed
fi

exec "$@"
