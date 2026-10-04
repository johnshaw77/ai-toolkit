# Claude Code mods

| # | mod | 做什麼 |
|---:|---|---|
| 1 | `context-trim` | Bash 輸出超過 400 行／40,000 字時只留頭尾與錯誤行；指令加 `# keep-full` 不剪；compact 時附上保留清單 |
| 2 | `model-router` | 依 prompt 自動選模型與 effort，子 agent 依類型挑模型；`!opus`／`!sonnet`／`!haiku` 強制指定，`/router` 開關 |
| 3 | `office` | `/office` 像素辦公室、`/sea` 海上冒險 pane，跟著 Claude 的工作狀態變化 |
| 4 | `conveyor` | Claude 工作時的搬運動畫：黃昏城市裡，token 方塊流進正在處理的檔案，機器人小搬推著推車來回走 |
| 5 | `host-badge` | 輸入框上方的機器名稱色塊（例如 `MBP`），多台電腦跑 Claude 時一眼分辨在哪台；名稱與顏色可在 `~/.claude/host-badge.json` 設定 `label`、`color` |
| 6 | `nightshift` | `/studio` 深夜工作室、`/camp` 山頂露營 pane，跟著 Claude 的工作狀態變化 |
| 7 | `mascot` | BMO 風格吉祥物＋LED 跑馬燈，跟著思考／工具呼叫／完成／出錯變化；`/mascot` 開關 |
| 8 | `mod-list` | `/mods` 列出所有 mod：名稱、斜線指令、有沒有載入、做什麼 |
| 9 | `done-ding` | 長任務結束時響一聲並跳系統通知；`/ding` 開關與調門檻 |
| 10 | `todo-rail` | 輸入框上方一排小方塊顯示待辦進度，旁邊寫目前進行中的項目 |
| 11 | `gate-lights` | 完成定義的三顆燈：測試、型別檢查、瀏覽器驗證 |
| 12 | `todo-panel` | 把 TodoWrite／Task 清單畫成側欄面板，輸入框上方一行摘要 |

## 裝到一台電腦

1. clone 到 `~/.claude/mods`
2. `~/.claude/settings.json` 的 `env` 加上：

   ```json
   "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/host-badge:~/.claude/mods/context-trim:~/.claude/mods/model-router:~/.claude/mods/office:~/.claude/mods/conveyor:~/.claude/mods/nightshift:~/.claude/mods/mascot:~/.claude/mods/mod-list:~/.claude/mods/done-ding:~/.claude/mods/todo-rail:~/.claude/mods/gate-lights:~/.claude/mods/todo-panel"
   ```

   （Windows 用 `;` 分隔）
3. `office/hooks/luffy.ts` 不在版控裡，從原本那台手動複製過來，不然 `office` 載入會失敗
4. 開新的 Claude Code session，狀態列出現 `🧭` 就是載入成功
