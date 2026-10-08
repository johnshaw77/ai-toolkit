# dark-ui 風格

深色 UI 卡片：每支影片有專屬畫面（終端機、聊天框、App 視窗、表單、表格、圖表），像在看一段操作示範。範本是 `templates/dark-ui/`（步驟進度條 + Claude 轉圈）。

## 配色

| # | 用途 | 色碼 |
|---:|---|---|
| 1 | 背景 | `#0e0e10` |
| 2 | 卡片 | `#19191c` |
| 3 | 邊線 | `#2c2c31` |
| 4 | 文字／次要文字 | `#e8e6e3`／`#9a9aa3` |
| 5 | 資訊 | 藍 `#5b9cf5` |
| 6 | 通過 | 綠 `#4ade80` |
| 7 | 失敗 | 紅 `#f4606c` |
| 8 | 等待、進行中 | 橘 `#e0775b`（Claude 橘） |
| 9 | 強調／警告 | 黃 `#f5d94a`／琥珀 `#f5a623` |
| 10 | 閒置 | 灰 `#4a4a52` |
| 11 | 品牌紅（標題條、結尾） | `#e8123a` |

狀態用顏色變化表達：灰 → 藍 → 綠，失敗轉紅並 `V.shake`。

## 動作詞彙（`head.part` 的 `V.*`）

| # | helper | 效果 | 音效 |
|---:|---|---|---|
| 1 | `pop(s, at, quiet)` | scale 0.8→1 + 淡入 | pop |
| 2 | `fade(s, at)` | 上移 8px + 淡入 | pop |
| 3 | `draw(s, at, dur)` | 線條描出（先 `prep`） | draw |
| 4 | `stroke(s, color, at, kind)` | 換線色 | 由 `kind` 決定 |
| 5 | `bar(s, at, dur, to, run, done)` | 進度條填滿，跑的時候用 `run` 色、完成換 `done` 色 | fill |
| 6 | `flip(id, over, color, at, kind)` | badge 換 icon（例如時鐘 → 打勾） | 由 `kind` 決定 |
| 7 | `along(s, path, at, dur)` | 沿路徑移動 | travel |
| 8 | `type(sel, text, at, per)` | 逐字打出 | key（每字一聲） |
| 9 | `count(c, from, to, at, dur)` | 計數器跳數字 | tick（每格一聲） |
| 10 | `shake(s, at)` | 左右抖動 | warn |
| 11 | `show`／`hide`／`swapText` | 直接切換 | 無 |

元件：`badge`、`overlay`、`pill`、`counter`、`mascot`、`icon`（Lucide）。

## 可重用的畫面元件（在 `templates/dark-ui/body.part`）

- `windowFrame(id,x,y,w,h)`：帶紅黃綠三點的 App 視窗；`card()`：無標題列的卡片。
- `claudeSpin(id,cx,cy,scale,parent,start,dur)`：Claude 風格 12 根短線轉圈（亮點繞圈、尾巴漸暗）。
- Stepper：`stepActive(n,at,glowDur,repeat)`、`stepDone(n,at)`、`stepLine(n,at)`、`swapPanel(a,b,at)`、`pillDone(n,at)`。
- 游標：群組 `cur`，用 x/y tween 移動，按下時 scale 抖一下並記 `tick`。

## 範例對照

| # | 範例 | 可以參考的畫面 | 品牌開場 |
|---:|---|---|---|
| 1 | `examples/ci` | 改完程式 push 後的 CI 流程 | 無 |
| 2 | `examples/codex` | 聊天輸入、生成進度、嵌入真實圖片（base64 + `<use>`） | 有 |
| 3 | `examples/desktop` | App 視窗、聊天框、整理成決議／待辦／風險卡 | 有 |
| 4 | `examples/skill` | 每天重複交代 vs. Skill（指令、腳本、範本） | 無 |
| 5 | `examples/sso` | 多系統登入、授權碼換令牌 | 無 |
| 6 | `examples/stepper` | 步驟進度條、Claude 轉圈（同範本） | 有 |
| 7 | `examples/webex` | 會議狀態流轉（等待主持人 → 進行中 → 結束） | 無 |

只有 codex、desktop、stepper 有 jnxstudio 開場與結尾；`ci`、`sso` 更早，連 `head.part`／`body.part` 都沒分檔。新影片一律從 `templates/` 複製。
