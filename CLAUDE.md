# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 這是什麼

這個 repo **本身就是一個 Claude Code plugin**（`unattended`），不是應用程式。
沒有 `package.json`、沒有測試框架、沒有建置步驟——產物就是 bash hook、
markdown 指令定義、和一支純標準庫的 Python 腳本。

改動的「正確性」不靠單元測試，靠**手動觸發 hook 看它吐什麼**（見下）。

## 開發與驗證

### 改完一定要 bump 版號

Plugin 更新是看 `.claude-plugin/plugin.json` 的 `version`。內容改了但版號沒動，
`claude plugin update` 會回報「已是最新版本」，快取繼續跑舊程式碼——
這是這個 repo 最常見的「改了沒生效」。

```bash
jq '.version = "0.13.0"' .claude-plugin/plugin.json > /tmp/p && mv /tmp/p .claude-plugin/plugin.json
git commit -am "..."
claude plugin update unattended    # 然後重開 Claude Code（hook 在對話開始時載入）
```

### 手動跑 hook

三個 hook 都是「stdin 吃一包 JSON、stdout 吐一包 JSON」，可以直接餵：

```bash
export CLAUDE_PLUGIN_ROOT="$PWD"

# SessionStart：確認注入的準則內容，以及 UNATTENDED 標記有沒有被讀到
echo '{"cwd":"/path/to/some/project"}' | bash hooks/session-start.sh | jq -r '.hookSpecificOutput.additionalContext'

# Stop gate：transcript_path 指向一份真的 .jsonl（~/.claude/projects/<專案>/*.jsonl）
echo '{"cwd":"/path/to/project","transcript_path":"/path/to/session.jsonl","stop_hook_active":false}' \
  | bash hooks/verify-gate.sh | jq .

# 存檔（Stop 帶 --session 只轉這一場；SessionEnd 不帶參數整個專案重掃）
# 注意：專案要先有 docs/transcripts/ 才會寫入，否則是 no-op
echo '{"cwd":"/path/to/project","transcript_path":"/path/to/session.jsonl"}' | bash hooks/archive-transcript.sh --session
```

驗收標準：**stdout 必須剛好是一包合法 JSON**（或空）。`| jq .` 失敗就是有東西
漏印到 stdout，見下面的 fd 紀律。

### 轉檔腳本

```bash
python3 scripts/transcript2html.py --here <專案路徑>          # 整個專案
python3 scripts/transcript2html.py --here <專案路徑> <jsonl>  # 只轉一場（Stop hook 走這條）
python3 scripts/transcript2html.py --all               # 全部專案 → ~/.claude/transcripts/
python3 scripts/transcript2html.py --index             # 只重建全域索引
```

只用標準庫，不要引入第三方依賴——它跑在 hook 裡，不能假設有 venv。

## 架構

三個 hook + 三個指令 + 一支轉檔腳本，靠**兩個標記檔**串起來：

```
.claude/UNATTENDED        存在 ＝ 無人值守模式
  寫入者：/unattended:mode、bin/unattended
  讀取者：hooks/session-start.sh（追加無人值守準則到注入的脈絡）

<專案>/docs/transcripts/  存在 ＝ 自動存檔已啟用
  建立者：/unattended:transcripts、/unattended:mode（開啟時順手建）
  內含 .gitignore（`*`）＝ 預設不進版控。由 transcript2html.py --here 每次確保存在，
  所以所有寫入路徑（hook 與三個指令）都自動帶到；已存在就不覆寫
  讀取者：hooks/archive-transcript.sh（Stop 與 SessionEnd 各註冊一次）
```

用檔案而不是靠語氣推測，因為「要不要自動 commit」不該建立在猜測上。
改動任一端時，另一端必須跟著改。

### hooks/session-start.sh —— 團隊共用準則的唯一來源

Plugin 無法寫入使用者的 `~/.claude/CLAUDE.md`，所以那些「每個專案都適用」的準則
（決策方式、Web/後端完成定義、Docker、文件分流、Git 規則）全部寫在這支腳本的
`base` 變數裡，以 `additionalContext` 注入。

**要改通用工作準則，就是改這個字串**，不是改各專案的 CLAUDE.md。
README「它做五件事」那節與這段字串是同一份內容的兩個複本——改一邊要同步另一邊。

### hooks/verify-gate.sh —— Stop 守門員

流程：用 jq 從 transcript JSONL 解析出 `Edit/Write/NotebookEdit` 的路徑 →
從每個檔案往上找最近的專案根（`package.json` / `pyproject.toml` / `go.mod` /
`Cargo.toml`）→ 只跑被影響到的那幾個專案的測試 → 再檢查有沒有真的驗過。

幾個不能拆的設計：

- **判斷依據只能是「工具呼叫」，不能對整份 JSONL 做 grep。** JSONL 裡同時存著
  `tool_result`，也就是**讀過的檔案原文**，全文 grep 會雙向誤判：讀過但沒改的
  `.tsx` 被當成改了 UI（誤擋），讀到的程式碼裡有 `curl` / `fetch(` 被當成打過
  endpoint（**安靜放行**）。所以先 `grep '"type":"tool_use"'` 縮行，再交給
  `jq_tool_use` 走 `.message.content[] | select(.type=="tool_use")` 取值。
  「驗過了」只認兩個來源：**工具名稱**（`mcp__claude-in-chrome__` 等）與
  **Bash 的 `command` 欄位**。加新框架支援是擴充那組 regex，不是放寬掃描範圍。
- **`jq -Rr` + `fromjson?`**：一行解析失敗就跳過那行，不會讓整支 hook 掛掉。
- `NotebookEdit` 的路徑欄位叫 `notebook_path` 不是 `file_path`，兩個都要取。

- **只擋一次**：開頭檢查 `stop_hook_active`，是 true 就放行。故意的——
  否則 dev server 起不來時會無限迴圈。它是提醒，不是牢籠。
- **`run_capped` 的看門狗要連子行程一起殺**：只 `kill $w` 的話那個 `sleep` 會
  變孤兒跑滿 300 秒，一場對話累積幾十個。`pkill -P` 那兩行不要刪。
- **看門狗必須 `>/dev/null 2>&1 </dev/null`**：否則它會持有 hook 的輸出管道，
  讀取端等不到 EOF。
- 「改了 UI / API」是**副檔名與路徑樣式**判斷（`edited_files` 那兩組 regex）。
- **全域時間預算 `BUDGET=600`**：`hooks.json` 給這支 hook 的 timeout 是 660 秒，
  但單步 300 秒 ×（專案根數量 × test/typecheck）很容易超過。被 harness 從外面
  砍掉時 hook 完全沒有輸出，看起來跟「檢查通過」一樣——又是一次安靜放行。
  所以預算用完要主動 `block` 並列出哪些專案沒跑到。改 `hooks.json` 的 timeout
  時，`BUDGET` 要跟著留一段餘裕。
- **一定要連 `subagents/` 一起掃**：子 agent 的工具呼叫只存在
  `${transcript_path%.jsonl}/subagents/agent-*.jsonl`，母檔裡只有一次 `Agent`
  呼叫。只掃母檔的話，實作一外包守門員就完全不作動——測試不跑、UI 不查，
  而且是**安靜放行**。多檔 grep 記得加 `-h`，否則 `file_path` 會被冠上檔名前綴。
- 逃生門：`.claude/.no-verify` 或 `CLAUDE_SKIP_VERIFY=1`。

### hooks/archive-transcript.sh —— 兩個觸發點，不能只留一個

`hooks.json` 把它註冊在 **Stop（帶 `--session`）和 SessionEnd** 兩處：

- **Stop**：每輪回合結束，只重轉這一場對話（實測約 0.2 秒）。
  少了它，無人值守跑一整晚的過程完全不會寫成 HTML——因為中途沒有 SessionEnd，
  而 `tmux kill-session` 收掉時 SessionEnd 也不會執行。
- **SessionEnd**：不帶參數，整個專案重掃（66 個 session / 652 MB 實測約 2 秒），
  補上任何漏掉的。

單場模式靠 `transcript2html.py --here <專案> <jsonl>` 的第三個參數。
要改觸發時機，`hooks.json`、這支腳本的 `mode` 分支、README 第 5 節、
`docs/TROUBLESHOOTING.md` 四處要一起改。

### fd 紀律（三個 hook 都一樣）

```bash
exec 3>&1 1>&2
...
jq -n '...' >&3
```

stdout 只能有回傳給 Claude Code 的那一包 JSON，所以 fd 1 整個導到 stderr，
另外留 fd 3 給真正的輸出。**新增任何會印東西的指令時不要繞過這個約定**——
多一行 `echo` 到 stdout 就會讓整個 hook 靜靜失效。

同理：hook **永遠 `exit 0`**（除了 verify-gate 用 `{"decision":"block"}` 表達
攔截）。hook 壞掉不該讓使用者的對話跟著壞掉。

### 依賴與跨平台

- `jq` 是硬依賴。缺了不要靜靜失效——`session-start.sh` 會回一則 `systemMessage`
  說明原因，新增依賴時比照辦理。
- Python 在 Windows 通常叫 `python` 不是 `python3`：`archive-transcript.sh`
  兩個都試，任何呼叫 Python 的地方都要照做。
- Windows 沒有 `tmux`，所以 `bin/unattended` 是**選配**、不自動安裝
  （plugin 不能動使用者的 PATH）。核心功能不可以依賴它。

## 慣例

- **這個 repo 可以直接 commit 到 `main`，不必先開分支。** 單人維護，而且 plugin
  marketplace 是從預設分支發布的——東西沒進 `main` 就等於沒發布，走分支只是多
  繞一次 merge。這是**這個 repo 的例外**，不是通則。
  - `push` 仍然要使用者明說。commit 是本地的、可以反悔；push 是對外動作。
- **文件、注釋、commit 訊息一律繁體中文**，commit 標題那行也是，
  技術名詞與程式識別字保留原文。（`git log` 早期是英文，那是舊慣例，不要跟著寫。）
  這條規則的正本在 `hooks/session-start.sh` 的 `## Git` 那節。
- 指令定義（`commands/*.md`）的 frontmatter 要寫 `allowed-tools` 白名單，
  新增指令時照既有格式。
- `/unattended:spec` 是**唯一該停下來問問題的指令**——因為使用者此刻還在，
  而規格交出去之後就沒人能澄清了。其餘一切遵循「不要停下來問」。
- `SPEC.md` 的定位是「這一輪的工單」，每輪重寫、舊的歸檔到 `docs/specs/`。
  這個規則同時寫在 `session-start.sh` 的注入內容和 `commands/spec.md` 裡，
  要改就兩邊一起改。
- 排錯知識累積在 `docs/TROUBLESHOOTING.md`（追加）。踩到新的坑就寫進去，
  尤其是「看起來正常但其實是假通過」那類——例如埠口衝突連到別人的服務。
