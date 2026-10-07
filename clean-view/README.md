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

## 安裝到別台電腦

在終端機的 Claude Code 輸入：

```
/plugin install clean-view --marketplace johnshaw77/ai-toolkit
```

問要不要加入 marketplace 時回 `y`，範圍選 user（按 Enter）。

## 結構

| # | 檔案 | 用途 |
|---:|---|---|
| 1 | `hooks/register.tsx` | 進入點；之後的新 mod 也在這裡註冊 |
| 2 | `hooks/clean-view.tsx` | 工具、計畫閘門、清單畫面、開關 |
| 3 | `hooks/checklist.ts` | 純邏輯：名稱清理、寬度計算、步驟推進 |
| 4 | `types/index.d.ts` | 共用 state 的型別（`clean-view` 底下） |
| 5 | `tests/clean-view.test.tsx` | `claude plugin test .` |

其他 mod 可以讀 `$.state.get({ plugin: 'clean-view', key: 'checklist' })` 拿到目前的清單。
