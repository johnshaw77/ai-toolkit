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
| 10 | `clean-view` | 簡潔檢視（隱藏工具細節、白話進度清單，`/simple`）＋ Agent Dock（把請求拆給 N 位 helper 的面板，`/dock`；`/dock auto` 由 TypeSafe Jev 判斷要不要拆） |
| 11 | `model-router` | 依 prompt 難度自動在 Haiku／Sonnet／Opus 之間換模型，由 TypeSafe Jev 判斷；`/router` 開關（預設關），`~opus` 等前綴強制指定 |

## 裝到一台電腦

1. clone ai-toolkit，把 `~/.claude/mods` 接成指向 `mods/` 的 symlink：

   ```bash
   ln -s ~/ai-toolkit/mods ~/.claude/mods
   ```

2. `~/.claude/settings.json` 的 `env` 加上：

   ```json
   "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/host-badge:~/.claude/mods/context-trim:~/.claude/mods/office:~/.claude/mods/conveyor:~/.claude/mods/nightshift:~/.claude/mods/mascot:~/.claude/mods/mod-list:~/.claude/mods/done-ding:~/.claude/mods/gate-lights:~/.claude/mods/clean-view:~/.claude/mods/model-router"
   ```

   （Windows 用 `;` 分隔）
3. `office/hooks/luffy.ts` 不在版控裡，從原本那台手動複製過來，不然 `office` 載入會失敗
4. 開新的 Claude Code session，輸入 `/mods` 看到清單就是載入成功

## model-router

每則你自己打的 prompt 先問 TypeSafe Jev「最小夠用的是 haiku、sonnet 還是 opus」，再把這一輪換成那個模型。狀態列顯示 `🧭 sonnet-5-5（0.98）` 這類目前用的模型與信心。

- 需要環境變數 `TYPESAFE_API_KEY`（在 [console.typesafe.ai/keys](https://console.typesafe.ai/keys) 建），加進 `~/.zshrc` 後重開 Claude Code
- `/router` 切換、`/router on`、`/router off`；狀態跨 session 保留，預設關
- prompt 開頭加 `~haiku`／`~sonnet`／`~opus` 直接指定，不問 Jev
- 問 Jev 的是「最便宜、一次就能做完的模型」，看需要多少推理、不看回覆長短；只送這則 prompt 和目前用的模型，不送上一則
- 保守規則：
  - 信心低於 0.5 不降級（升級照做）
  - 對話比開場多出 40,000 tokens 後只升不降（換模型要整段重寫快取，降級省下的抵不過）；system prompt 與工具定義這段固定開銷不算
  - 同一輪內不換；12 字以內的接續（「好」「繼續」）沿用上一輪的判斷
  - Claude 還在回答時先打好的 prompt 也會判斷，輪到它那一輪才套用
- Jev 逾時（1.5 秒）、沒有 key、回錯誤碼：這一輪不換模型，跳一則提示
- 子 agent 不插手，task-notification 等不是你打的 prompt 沿用上一輪的模型
