#!/usr/bin/env bash
# Stop hook：完成度守門員。
#
# 只在「這場對話真的改過檔案」時作動，然後檢查兩件事：
#   1. 被改到的每個子專案，測試與型別檢查都要過
#   2. 改了 UI 就要開過瀏覽器；改了 API 就要真的打過 endpoint
#
# 支援 monorepo：從改動的檔案往上找最近的專案根（package.json /
# pyproject.toml / go.mod / Cargo.toml），只跑被影響到的那些。
#
# 逃生開關：專案根放 .claude/.no-verify，或設 CLAUDE_SKIP_VERIFY=1
set -uo pipefail

# stdout 只能有我們要回傳的那一份 JSON。任何子指令不小心印到 stdout 的東西
# 都會弄壞它，所以把 fd 1 整個導到 stderr，另外留 fd 3 給真正的輸出。
exec 3>&1 1>&2

input=$(cat)
j() { printf '%s' "$input" | jq -r "$1" 2>/dev/null; }

# 這次停止本來就是上一輪 hook 擋下來的 → 放行，避免無限迴圈
[ "$(j '.stop_hook_active // false')" = "true" ] && exit 0

cwd=$(j '.cwd // ""')
[ -n "$cwd" ] && cd "$cwd" 2>/dev/null || exit 0

block() { jq -n --arg r "$1" '{decision:"block", reason:$r}' >&3; exit 0; }

[ -f .claude/.no-verify ] && exit 0
[ "${CLAUDE_SKIP_VERIFY:-}" = "1" ] && exit 0

# ---------- 掃 transcript：改了什麼、驗過什麼 ----------
tp=$(j '.transcript_path // ""')
[ -f "$tp" ] || exit 0

# 子 agent 的工具呼叫**不會**出現在母 session 的紀錄裡——母檔只看得到一次
# Agent 呼叫，實際的 Edit、Bash、瀏覽器操作全在獨立的
# <母檔去掉副檔名>/subagents/agent-*.jsonl。
# 不一起掃的話，把實作外包給子 agent 就等於把守門員關掉，而且它會安靜地放行。
tps=("$tp")
sub_dir="${tp%.jsonl}/subagents"
if [ -d "$sub_dir" ]; then
  for s in "$sub_dir"/*.jsonl; do
    [ -f "$s" ] && tps+=("$s")
  done
fi

# 這裡一定要用 jq 解析出「真正的工具呼叫」，不能對整份 JSONL 做 grep。
# 因為 JSONL 裡同時存著 tool_result，也就是**讀過的檔案原文**，全文 grep 會
# 雙向誤判：
#   讀過（但沒改）一個 .tsx        → 被當成改了 UI，沒開瀏覽器就誤擋
#   讀到的程式碼裡有 curl / fetch( → 被當成打過 endpoint，而且是**安靜放行**
# 後者正是這個守門員最該避免的失效方式，所以判斷依據只能是工具呼叫本身。
#
# 多檔時 grep 會在每行前面加檔名，-h 關掉。先 grep 再交給 jq 是為了只解析
# 有工具呼叫的那幾行，不必整份重新 parse。
jq_tool_use() {   # $1 = 接在 select(tool_use) 之後的 jq 表達式
  grep -h '"type":"tool_use"' "${tps[@]}" 2>/dev/null \
    | jq -Rr "fromjson? | .message.content[]? | select(.type == \"tool_use\") | $1" 2>/dev/null
}

# NotebookEdit 的路徑欄位叫 notebook_path 不是 file_path，兩個都要取。
edited_files=$(jq_tool_use '
  select(.name == "Edit" or .name == "Write" or .name == "NotebookEdit")
  | (.input.file_path // .input.notebook_path // empty)' | sort -u)
[ -n "$edited_files" ] || exit 0   # 沒改過檔案

# 「有沒有真的驗過」只可能表現在兩個地方：工具名稱（瀏覽器 MCP）與 Bash 指令內容。
# 取這兩者組成一行一筆，後面的比對都只掃這份，不再碰原始 JSONL。
tool_calls=$(jq_tool_use '.name + " " + ((.input.command // "") | tostring)')

# 比對一律用 here-string，**不可以** `printf ... | grep -q`：
# grep -q 找到第一筆就結束，輸入超過 pipe 緩衝（約 64KB）時 printf 會收到 SIGPIPE
# 以 141 結束，在 pipefail 下整條 pipeline 判定失敗，`&& x=1` 不會執行。
# 長 session 的 tool_calls 很容易超過 64KB，結果就是明明開過瀏覽器還被擋。
ui_touched=0; api_touched=0
grep -qiE '\.(tsx|jsx|vue|svelte|css|scss|less|html|astro)$' <<< "$edited_files" && ui_touched=1
grep -qiE '(^|/)(routes?|router|controllers?|handlers?|api|endpoints?|views|serializers)(/|\.)|(^|/)(urls|main|server|app)\.(py|js|ts)$' \
  <<< "$edited_files" && api_touched=1

browser_used=0; http_used=0
grep -q 'mcp__claude-in-chrome__\|chrome-devtools__' <<< "$tool_calls" && browser_used=1
grep -qE '\bcurl\b|\bhttpie\b|requests\.(get|post|put|delete)|\bfetch\(|TestClient|supertest|\bhttpx\b' \
  <<< "$tool_calls" && http_used=1
# 開過瀏覽器就等於打過這個服務
[ "$browser_used" = "1" ] && http_used=1

# ---------- 找出被影響到的專案根 ----------
project_root_of() {   # 往上找最近含有專案標記檔的目錄
  local d; d=$(dirname "$1")
  while [ "$d" != "/" ] && [ -n "$d" ]; do
    for m in package.json pyproject.toml go.mod Cargo.toml; do
      [ -f "$d/$m" ] && { printf '%s\n' "$d"; return; }
    done
    d=$(dirname "$d")
  done
}

roots=$(while IFS= read -r f; do
          [ -n "$f" ] && project_root_of "$f"
        done <<< "$edited_files" | sort -u)
[ -n "$roots" ] || exit 0

# ---------- 執行測試 ----------
run_capped() {   # run_capped <秒> <輸出檔> <指令...>
  local secs=$1 out=$2; shift 2
  ( "$@" ) >"$out" 2>&1 </dev/null &
  local pid=$!
  # 看門狗必須切斷 stdout/stderr，否則會持有 hook 的輸出管道讓讀取端等不到 EOF
  ( sleep "$secs"; kill -9 "$pid" 2>/dev/null ) >/dev/null 2>&1 </dev/null &
  local w=$!
  wait "$pid"; local rc=$?
  # 先殺看門狗的子行程（那個 sleep），再殺看門狗本身。
  # 只殺 $w 的話，sleep 會變孤兒繼續跑滿秒數，一場對話下來會累積幾十個。
  pkill -9 -P "$w" 2>/dev/null
  kill -9 "$w" 2>/dev/null
  wait "$w" 2>/dev/null
  pkill -9 -P "$pid" 2>/dev/null
  return $rc
}

# hooks.json 給這支 hook 的 timeout 是 660 秒，但單步上限 300 秒 ×（專案根數量 ×
# test/typecheck 兩步）很容易超過。被 harness 從外面砍掉時 hook 不會有任何輸出，
# 看起來就跟「檢查通過」一樣——又是一次安靜放行。所以自己先抓一個全域預算，
# 用完由我們主動回報還有哪些沒跑到。
BUDGET=600
budget_left() { local r=$(( BUDGET - SECONDS )); [ "$r" -lt 0 ] && r=0; printf '%s' "$r"; }
step_cap()    { local r; r=$(budget_left); [ "$r" -gt 300 ] && r=300; printf '%s' "$r"; }

fail() {   # fail <專案根> <這步叫什麼> <輸出檔>
  local out; out=$(tail -40 "$3" | sed $'s/\033\\[[0-9;]*[a-zA-Z]//g')
  rm -f "$3"
  block "\`$2\`（在 $1）沒有通過，工作還沒完成。請把問題修掉，全綠之後再結束；
真的修不動的話，說明卡在哪並附上錯誤內容。

--- 最後 40 行 ---
$out"
}

skipped=""
while IFS= read -r root; do
  [ -n "$root" ] || continue
  if [ "$(budget_left)" -lt 15 ]; then
    skipped="$skipped
- $root"
    continue
  fi
  tmp=$(mktemp)

  if [ -f "$root/package.json" ]; then
    for s in test typecheck; do
      jq -e --arg s "$s" '.scripts[$s] // empty' "$root/package.json" >/dev/null 2>&1 || continue
      # npm --prefix 會連 script 的 cwd 一起設成 $root，相對路徑的 fixture／config
      # 讀得到，不必再包一層 cd。
      run_capped "$(step_cap)" "$tmp" env CI=true npm --prefix "$root" run "$s" --silent \
        || fail "$root" "npm run $s" "$tmp"
    done

  elif [ -f "$root/pyproject.toml" ] || [ -f "$root/pytest.ini" ]; then
    if command -v pytest >/dev/null; then
      run_capped "$(step_cap)" "$tmp" sh -c "cd '$root' && pytest -q" \
        || fail "$root" "pytest" "$tmp"
    fi

  elif [ -f "$root/go.mod" ]; then
    run_capped "$(step_cap)" "$tmp" sh -c "cd '$root' && go test ./..." \
      || fail "$root" "go test ./..." "$tmp"

  elif [ -f "$root/Cargo.toml" ]; then
    run_capped "$(step_cap)" "$tmp" sh -c "cd '$root' && cargo test" \
      || fail "$root" "cargo test" "$tmp"
  fi

  rm -f "$tmp"
done <<< "$roots"

[ -n "$skipped" ] && block "守門員的時間預算（${BUDGET} 秒）用完了，下面這幾個專案的測試**完全沒跑到**：
$skipped
請自己進去跑一次測試與型別檢查，全綠再結束；真的太慢就在 .claude/.no-verify 豁免這個專案，改用別的方式驗。"

# ---------- 有沒有真的驗過 ----------
if [ "$ui_touched" = "1" ] && [ "$browser_used" = "0" ]; then
  block "這個 session 改了畫面相關的檔案，但從頭到尾沒有用 Chrome MCP 開過瀏覽器。

請照下面做完再回報：
1. 啟動服務（專案有 docker compose 就用 compose，否則跑在 tmux 裡方便讀 log）
2. 用 mcp__claude-in-chrome 開對應頁面，**先確認 <title> 是這個專案的**
   （埠口可能被別的服務佔用，連錯了會對著別人的畫面截圖）
3. **實際走一次使用流程**並截圖，不是只開起來看一眼
4. 檢查 console：不可以有任何 error 或 warning
5. 回報你實際操作了什麼、看到什麼

只做 type-check 或「看起來應該沒問題」不算完成。"
fi

if [ "$api_touched" = "1" ] && [ "$http_used" = "0" ]; then
  block "這個 session 改了 API／路由相關的檔案，但從頭到尾沒有真的打過任何 endpoint。

單元測試通過不等於服務跑得起來——啟動失敗、路由沒註冊、middleware 順序錯、
環境變數缺漏，這些單元測試都抓不到。請：

1. 把服務跑起來（有 docker compose 就 \`docker compose up -d\`）
2. 確認它活著：\`curl -s -o /dev/null -w '%{http_code}' http://localhost:<port>/health\`
3. **實際打一次你改到的 endpoint**，檢查狀態碼與回傳結構
4. 看服務 log 有沒有錯誤（\`docker compose logs --tail=50 <service>\`）
5. 回報你打了什麼、拿到什麼

若這次改動確實無法從外部呼叫（例如純內部工具函式），說明原因即可。"
fi

exit 0
