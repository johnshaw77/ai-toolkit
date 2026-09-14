# 排錯

## 守門員沒有擋我

按這個順序檢查：

| 症狀 | 原因 | 怎麼確認 |
|---|---|---|
| 完全沒反應 | 專案沒有 `package.json` | `ls package.json` |
| 完全沒反應 | 有 `.claude/.no-verify` 豁免檔 | `ls .claude/.no-verify` |
| 完全沒反應 | 這場對話沒用 Edit/Write 改過檔案 | 純問答不觸發，正常 |
| 只擋一次就放行 | **刻意設計** | 見下 |
| 裝了 plugin 卻沒動靜 | hook 設定在對話開始時載入 | 重開 Claude Code |
| 改了 plugin 卻沒生效 | **版號沒 bump** | 見下 |

### 為什麼只擋一次

hook 會檢查 `stop_hook_active`。擋過一次、讓 Claude 繼續做完之後，下一次結束就放行。

這是**故意的**：否則遇到「dev server 起不來」這種修不好的情況會無限迴圈卡死。
它的定位是提醒，不是牢籠。

需要「真的做完才准停」，那是 `/ralph-loop` 的場合——但注意它也是 Stop hook，
兩者會疊加。

### 改了 plugin 卻沒生效

Plugin 更新是**看版號**的。內容改了但 `plugin.json` 的 `version` 沒動，
`claude plugin update` 會回報「已是最新版本」，快取繼續用舊程式碼。

```bash
# 改完內容後
jq '.version = "0.3.0"' .claude-plugin/plugin.json > /tmp/p && mv /tmp/p .claude-plugin/plugin.json
git commit -am "..."
claude plugin update unattended
# 然後重開 Claude Code
```

---

## 埠口衝突：驗證「通過」但畫面是別人的

**這是最危險的一種失敗，因為它看起來完全正常。**

dev server 的埠（Vite 預設 5173、CRA 3000）很容易被其他東西佔用——最常見的是
背景執行的 Docker container。

危險之處在於**它不會壞得很明顯**：

- dev server 有跑時，你的 server 通常會搶贏（綁 IPv4 vs 容器綁 `0.0.0.0`）
- 但**一旦 dev server 沒起來或中途掛掉，那個埠不會回錯誤頁，而是安靜地回
  另一個專案的畫面**

無人值守時的後果：開頁面 → 看到一個正常運作的網頁 → 截圖 → 回報「驗證通過」。
但那是別人的 App。**假通過，而且毫無異狀。**

真實案例（開發本 plugin 時遇到的）：

| 網址 | 回應 |
|---|---|
| `localhost:5173`（dev server 沒跑時） | 某個 Docker 容器裡的另一個專案 |
| `localhost:5199` | 才是當下在開發的專案 |

### 兩道防線

**一、指定專屬的埠並開 `strictPort`**

```ts
// vite.config.ts
server: { port: 5199, strictPort: true }
```

`strictPort` 讓埠被佔走時**直接啟動失敗**，而不是悄悄換一個埠。
寧可大聲壞掉，也不要安靜地連到別人的服務。

**二、開頁面後第一件事先確認 `<title>`**

不對就是連錯服務，先把 dev server 弄起來，不要對著別人的畫面截圖。
這條已經寫進 plugin 注入的完成定義裡。

### 查誰佔用某個埠

```bash
# macOS / Linux
lsof -nP -iTCP:5173 -sTCP:LISTEN

# Windows（PowerShell 或 cmd）
netstat -ano | findstr :5173

# 兩邊都適用
docker ps --format '{{.Names}}\t{{.Ports}}' | grep 5173
```

---

## 對話存檔沒有產生

| 症狀 | 原因 |
|---|---|
| **新專案完全沒有 `docs/transcripts/`** | 開關沒開。`/spec`、`/mode`、`/transcripts` 任一個都會建；一個都沒跑就不會有 |
| 有資料夾但沒更新 | **裝的 plugin 版本太舊**（見下），或對話還在跑而你只等 SessionEnd |
| 只看得到「上一場」對話 | 舊版只在 SessionEnd 轉檔。0.13.0 起 Stop hook 每輪也會更新 |
| 落後一個回合 | 正常：Stop hook 是在回合**結束時**跑的 |
| 完全沒有任何輸出 | 缺 `python3` 或 `jq` |
| `git status` 看不到紀錄 | 正常：0.19.0 起資料夾內有 `.gitignore`（`*`），預設不進版控 |
| 有 `.gitignore` 但紀錄還是出現在 `git status` | 以前 commit 過，ignore 管不到已追蹤的檔案。`git rm -r --cached docs/transcripts` 後 commit |
| 把 `.gitignore` 刪了，下一輪又長回來 | 刻意的：只有檔案不存在才寫入。要進版控就保留檔案、刪掉裡面的 `*` |
| worktree 收掉後紀錄不見了 | 被 ignore 的檔案 `git worktree remove` 不會擋，直接一起刪。見 `docs/PARALLEL.md` 收尾那節 |

### 先確認你裝的是哪一版

**這是最容易被忽略的一項。** `claude plugin update` 沒跑、或跑了沒重開，
裝的就還是舊版——新功能一個都沒有，但看起來 plugin 明明「有在運作」
（因為舊版的常駐準則照樣注入）。

```bash
jq -r .version ~/.claude/plugins/marketplaces/claude-unattended-workflow/.claude-plugin/plugin.json
jq -r '.hooks.Stop[].hooks[].command' ~/.claude/plugins/marketplaces/claude-unattended-workflow/hooks/hooks.json
```

Stop 只列出 `verify-gate.sh` 一行 → 舊版，沒有每輪存檔。應該要有兩行。

```bash
claude plugin update unattended     # 然後重開 Claude Code
```

手動補跑：

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/transcript2html.py" --here
```

被強制關閉時（`tmux kill-session`）SessionEnd 不會執行，但 Stop hook 已經在
每個回合結束時更新過了，所以最多落後一個回合。

而且**無論如何 JSONL 原始紀錄都還在** `~/.claude/projects/`——HTML 只是視圖，
補跑一次就回來了，不會真的遺失任何東西。

---

## 無人值守模式關不掉

標記檔殘留。`unattended` 指令會在 claude 正常結束時自動清除，但 tmux 被強制
砍掉就會留著——那個專案之後每次對話都會是無人值守，會在你還坐在電腦前的時候
自動 commit。

```
/unattended:mode status     # 查
/unattended:mode off        # 關
rm .claude/UNATTENDED  # 或直接刪
```
