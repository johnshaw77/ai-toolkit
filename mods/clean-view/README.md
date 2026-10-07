# Clean View（簡潔檢視）

讓 Claude Code 對不熟技術的人也看起來平靜、好懂。Claude 工作時，工具呼叫、檔案 diff、
指令輸出都會隱藏，輸入框上方只留一張白話進度清單：

```
建立登陸頁 · 1分12秒                          [ ● 簡潔檢視：開 ]
✓ 讀你的品牌筆記            ██████████  完成
▶ 建立價格區塊              ██████░░░░  60%
○ 加上聯絡表單              ░░░░░░░░░░  下一步
○ 修飾頁尾                  ░░░░░░░░░░  稍後
```

標題列會跟著狀態變：工作中（名稱・經過時間）、**需要你**（等你同意或回覆）、
⚠ 卡住了、■ 已停止、✓ 全部完成（5 秒後縮成一行）。

## 開關

- 點清單右上角的 `[ ● 簡潔檢視：開 ]` 按鈕，或
- 輸入 `/simple on`、`/simple off`；只輸入 `/simple` 會切換。

設定會記住，重開 Claude Code 也一樣。關掉時所有隱藏的內容都會回來，只留下按鈕。

## Agent Dock

把每個請求拆給固定人數的 helper 平行處理，右側面板每位 helper 一張卡片：英文縮寫徽章、
任務名稱、計時器、進度條。全部完成後顯示「N 位助手完成「…」，花了 …」。

- `/dock`：打開或收起面板（收起時狀態列顯示「◆ 工作中 · 排隊 · 完成」徽章）。
  輸入框上方那列的 `◆ Dock` 按鈕也能打開。
- `/dock 10`：設定團隊人數（1 到 100）。超過 20 要在面板裡按確認，而且下次開新 session 會回到 1。
- `/dock 3 收集鴻海、台積電最新消息`：一行完成，設好人數就把後面的問題送出。
- 人數 1：由 Claude 自己決定要不要找 helper，什麼都不加。
- 人數 N：請求會帶上「剛好拆成 N 份」的指示；超過 N 個會被擋下，派了但不到 N 個會補送一次提醒（一位都沒派代表不適合拆，不提醒）；
  超過同時上限（`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` 與 `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY`
  取小的）的 helper 由 Dock 自己排隊。
- 助手模型：「快速省錢」（人數大於 1 且沒指定模型時改用 Haiku）或「跟你同一個模型」。
- 即時人數寫到 `~/.claude/ai-employee-kit-data/agents-now/<session_id>.json`，給狀態列讀。

## 安裝到別台電腦

在終端機的 Claude Code 輸入：

```
/plugin install clean-view --marketplace johnshaw77/ai-toolkit
```

問要不要加入 marketplace 時回 `y`，範圍選 user（按 Enter）。

## 結構

| # | 檔案 | 用途 |
|---:|---|---|
| 1 | `hooks/register.tsx` | 進入點；Dock 先註冊，再註冊 Clean View |
| 2 | `hooks/clean-view.tsx` | 工具、計畫閘門、清單畫面、開關 |
| 3 | `hooks/checklist.ts` | 純邏輯：名稱清理、寬度計算、步驟推進 |
| 4 | `types/index.d.ts` | 共用 state 的型別（`clean-view` 底下） |
| 5 | `hooks/dock.tsx` | Agent Dock：所有 `$` 呼叫（面板、指令、上限、排隊、回報） |
| 6 | `hooks/dock-logic.ts` | Agent Dock 純邏輯：人數、名稱、徽章、計數、總結、進度條 |
| 7 | `tests/*.test.tsx` | `claude plugin test .` |

其他 mod 可以讀 `$.state.get({ plugin: 'clean-view', key: 'checklist' })` 拿到目前的清單。
