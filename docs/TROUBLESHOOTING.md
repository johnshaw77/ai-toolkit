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

---

## `unattended --loop` 行為不如預期

| 症狀 | 原因 |
|---|---|
| 「SPEC.md 裡沒有頂格的 `- [ ] ` 項目」 | 舊格式的 SPEC.md（`## F1` 標題、沒有核取方塊）。把每項標題改成頂格 `- [ ] **F1** …`，或重跑 `/unattended:spec` |
| 項目明明做完了還一直重跑、最後被標 `- [-]` | 執行者沒把那行改成 `- [x]`。迴圈**只看勾選**，不看 commit 或測試。看 log 裡那一輪最後的輸出 |
| 一項都還沒做就被跳過 | 完成條件寫得做不到（外部服務、需要權限），或缺縮排讓完成條件也被當成項目。把完成條件縮排並改成一般 `-` |
| 項目數算錯 | 完成條件用了核取方塊又沒縮排。迴圈的判斷是 `grep -cE '^- \[ \] '`，只有頂格才算 |
| 「claude 連續 3 次異常結束」 | 額度用完、網路斷線或登入過期。看 log 最後的錯誤，處理後重跑 `unattended --loop`，已打勾的項目不會重做 |
| 「超過 N 輪上限」 | 保險絲：待辦數 ×3 + 2 輪。正常每項最多兩輪，超過代表 SPEC.md 在迴圈中被改過（例如執行者自己加了新的 `- [ ]` 項目），看 log 與 `git log -p SPEC.md` |
| 每一輪都卡在權限詢問 | 不會發生——迴圈固定帶 `--permission-mode bypassPermissions`。如果你在 `--` 之後又傳了別的 `--permission-mode`，拿掉它 |
| 看不到它在想什麼 | `-p` 模式只印最後的回覆。過程看 `docs/transcripts/index.html`（Stop hook 每輪都會更新） |

迴圈中途想停：`tmux kill-session -t claude-<專案>`，然後確認 `.claude/UNATTENDED`
已刪（被強制砍掉時可能殘留，見上一節）。

---

## Windows

| 症狀 | 原因與處理 |
|---|---|
| hook 或 `unattended` 報 `$'\r': command not found` | 腳本被 checkout 成 CRLF。0.21.0 起 `.gitattributes` 固定成 LF，但**在那之前就 clone 的副本不一定會自動修正**。先在 `~/.claude/plugins/marketplaces/claude-unattended-workflow` 執行 `git rm --cached -r . -q && git reset --hard`，再 `/plugin uninstall unattended`、`/plugin install unattended` 讓快取重新複製，然後重開 Claude Code |
| `✗ 沒有安裝 tmux` | 原生 Windows 沒有 tmux。加 `--no-tmux`，或改用 WSL |
| 無人值守跑到一半整個停住，沒有任何錯誤 | 電腦睡眠了。設定 → 系統 → 電源，接電源時睡眠改成「永不」 |
| `unattended` 還是舊版（沒有 `--loop`） | 用 `cp` 或 Git Bash 的 `ln -s`（預設是複製）裝的。改用 README 裡的 alias 直接呼叫 plugin 那份 |
| hook 完全沒作用、也沒有 jq 的提示 | Claude Code 找不到 Git Bash，改用 PowerShell 跑 hook。裝 Git for Windows，必要時設定 `CLAUDE_CODE_GIT_BASH_PATH` 指到 `bash.exe` |
| 對話存檔沒產生 | Python 叫 `python` 不叫 `python3` 已經處理；確認 `python --version` 能跑，而不是跳出 Microsoft Store |
| SPEC.md 用 Windows 編輯器存成 CRLF | 不影響：迴圈計數與跳過都有處理 `\r` |

> 以上是依腳本內容推斷與 macOS 上模擬（CRLF 檔案、拿掉 tmux 的 PATH）驗證的，
> 尚未在 Windows 實機跑過。實際踩到的坑請補進這一節。
