#!/usr/bin/env bash
# 把這次對話轉成可離線調閱的 HTML。
#
# 兩個時機都會跑：
#   Stop（每輪回合結束，帶 --session）  只重轉「這一場」對話。
#       無人值守可能一跑好幾個小時，中途沒有 SessionEnd；沒有這個觸發點的話
#       HTML 會停在上一次對話結束的狀態，正在跑的這場完全看不到。
#       而且 tmux 被強制砍掉時 SessionEnd 根本不會執行，等於整場紀錄都沒有 HTML。
#   SessionEnd（對話結束，不帶參數）    整個專案重掃一遍，補上任何漏掉的 session。
#
# 動作：
#   1. 一律更新全域封存      ~/.claude/transcripts/
#   2. 專案若已「加入」，同時更新專案內的可分享版本
#      加入方式：在專案跑一次 /unattended:transcripts（會建立 docs/transcripts/，
#      那個資料夾的存在就是開關）
#
# 失敗絕不影響對話流程（一律 exit 0）。
set -uo pipefail

mode="${1:-full}"

# stdout 只能有我們要回傳的那一份 JSON。任何子指令不小心印到 stdout 的東西
# 都會弄壞它，所以把 fd 1 整個導到 stderr，另外留 fd 3 給真正的輸出。
exec 3>&1 1>&2

input=$(cat)
j() { printf '%s' "$input" | jq -r "$1" 2>/dev/null; }

tp=$(j '.transcript_path // ""')
cwd=$(j '.cwd // ""')
SCRIPT="${CLAUDE_PLUGIN_ROOT}/scripts/transcript2html.py"

[ -n "$tp" ] && [ -f "$tp" ] && [ -f "$SCRIPT" ] || exit 0

# Windows 的 Python 通常叫 python 而不是 python3
PY=""
for c in python3 python; do command -v "$c" >/dev/null && { PY="$c"; break; }; done
[ -n "$PY" ] || exit 0

"$PY" "$SCRIPT" "$tp" >/dev/null 2>&1 || true

if [ -n "$cwd" ] && [ -d "$cwd/docs/transcripts" ]; then
  if [ "$mode" = "--session" ]; then
    # 回合結束：只轉這一場。整個專案重掃是 SessionEnd 的事。
    "$PY" "$SCRIPT" --here "$cwd" "$tp" >/dev/null 2>&1 || true
  else
    "$PY" "$SCRIPT" --here "$cwd" >/dev/null 2>&1 || true
  fi
fi

exit 0
