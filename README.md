# Claude Code mods

| # | mod | 做什麼 |
|---:|---|---|
| 1 | `context-trim` | Bash 輸出超過 400 行／40,000 字時只留頭尾與錯誤行；指令加 `# keep-full` 不剪；compact 時附上保留清單 |
| 2 | `model-router` | 依 prompt 自動選模型與 effort，子 agent 依類型挑模型；`!opus`／`!sonnet`／`!haiku` 強制指定，`/router` 開關 |
| 3 | `office` | `/office` 像素辦公室、`/sea` 海上冒險 pane，跟著 Claude 的工作狀態變化 |
| 4 | `battery` | 輸入框上方的像素電池 HUD：context、5 小時、7 天額度各剩多少；閒置時顯示，工作中讓出 band；`/battery` 開關 |

## 裝到一台電腦

1. clone 到 `~/.claude/mods`
2. `~/.claude/settings.json` 的 `env` 加上：

   ```json
   "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/context-trim:~/.claude/mods/model-router:~/.claude/mods/office:~/.claude/mods/battery"
   ```

   （Windows 用 `;` 分隔）
3. `office/hooks/luffy.ts` 不在版控裡，從原本那台手動複製過來，不然 `office` 載入會失敗
4. 開新的 Claude Code session，狀態列出現 `🧭` 就是載入成功
