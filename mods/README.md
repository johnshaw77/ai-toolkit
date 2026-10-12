# Claude Code mods

2026-10-08 起收在 ai-toolkit 的 `mods/`（以 `git subtree` 併入，保留原本的歷史）。舊 repo `johnshaw77/claude-code-mods` 不再更新。

| # | mod | 做什麼 |
|---:|---|---|
| 1 | `context-trim` | Bash 輸出超過 400 行／40,000 字時只留頭尾與錯誤行；指令加 `# keep-full` 不剪；compact 時附上保留清單 |
| 2 | `office` | `/office` 像素辦公室、`/sea` 海上冒險 pane，跟著 Claude 的工作狀態變化 |
| 3 | `conveyor` | Claude 工作時的搬運動畫：黃昏城市裡，token 方塊流進正在處理的檔案，機器人小搬推著推車來回走 |
| 4 | `host-badge` | 輸入框上方的機器名稱色塊（例如 `MBP`），多台電腦跑 Claude 時一眼分辨在哪台；`/badge <名稱>` 當下改名（寫回設定檔）；名稱與顏色也可在 `~/.claude/host-badge.json` 設定 `label`、`color` |
| 5 | `nightshift` | `/studio` 深夜工作室、`/camp` 山頂露營 pane，跟著 Claude 的工作狀態變化 |
| 6 | `mascot` | BMO 風格吉祥物＋LED 跑馬燈，跟著思考／工具呼叫／完成／出錯變化；`/mascot` 開關 |
| 7 | `mod-list` | `/mods` 列出所有 mod：名稱、斜線指令、有沒有載入、做什麼 |
| 8 | `done-ding` | 長任務結束時響一聲並跳系統通知；`/ding` 開關與調門檻 |
| 9 | `gate-lights` | 完成定義的三顆燈：測試、型別檢查、瀏覽器驗證 |
| 10 | `clean-view` | 簡潔檢視（隱藏工具細節、白話進度清單，`/simple`）＋ Agent Dock（把請求拆給 N 位 helper 的面板，`/dock`） |

## 裝到一台電腦

1. clone ai-toolkit，把 `~/.claude/mods` 接成指向 `mods/` 的 symlink：

   ```bash
   ln -s ~/ai-toolkit/mods ~/.claude/mods
   ```

2. `~/.claude/settings.json` 的 `env` 加上：

   ```json
   "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/host-badge:~/.claude/mods/context-trim:~/.claude/mods/office:~/.claude/mods/conveyor:~/.claude/mods/nightshift:~/.claude/mods/mascot:~/.claude/mods/mod-list:~/.claude/mods/done-ding:~/.claude/mods/gate-lights:~/.claude/mods/clean-view"
   ```

   （Windows 用 `;` 分隔）
3. `office/hooks/luffy.ts` 不在版控裡，從原本那台手動複製過來，不然 `office` 載入會失敗
4. 開新的 Claude Code session，狀態列出現 `🧭` 就是載入成功
