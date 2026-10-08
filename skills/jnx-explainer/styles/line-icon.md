# line-icon 風格

米白底、線性 icon、膠囊標籤、線條描繪，像 YouTube 解說影片的 icon 動畫。適合講概念、架構、流程。範本是 `templates/line-icon/`（上線檢查閘門）。

## 配色（`head.part` 的 `C`）

| # | 用途 | 色碼 |
|---:|---|---|
| 1 | 背景 | `#F2F0EB` 暖米白，無漸層、無材質 |
| 2 | 線條、icon、主文字 | `#1F1F1F` 近黑 |
| 3 | 強調色（只用一個） | `#C96442`，只用在重點狀態：進度、放行、打勾、章節 |
| 4 | 說明文字 | `#6E6A61`（原本的 `#8A867C` 對比只有 3.19:1，過不了 check） |
| 5 | 連接線 | `#BDB8AC` |
| 6 | icon 容器 | 白 `#FFFFFF`，極淡陰影 |

品牌開場與結尾的紅（logo、iris 轉場）照用；字標用深字版（`wm.b64`，「jnx」是近黑）。

## 元件

| # | helper | 內容 |
|---:|---|---|
| 1 | `node(id, cx, cy, icon, label)` | 白色圓角方塊 120×120（圓角 26），Lucide icon 放大 3 倍、線寬 1.35，下方 22px 灰色說明 |
| 2 | `mark(id, cx, cy)` | 強調色圓 + 白勾，掛在 node 右上角（`cx+52, cy-52`） |
| 3 | `pill(id, cx, cy, text, fill, size)` | 全圓角膠囊，深色或強調色底白字 |
| 4 | `line(id, d, cls)` | 連接線，會自動 `prep`；`ln` 是 3px 灰線，`al` 是 4px 強調色線（「放行」的路徑疊在灰線上） |

## 版面

- 主流程沿 y=450 水平展開，左進右出；分岔向上下各約 190。
- 元素之間保留至少 120 水平間距；畫面同時存在的主要元素不超過 6 個。
- 章節膠囊先出現在畫面中間，講完用 `V.ghostPill` 縮到左上 (160, 80)。

## 動作詞彙（`head.part` 的 `V.*`）

| # | helper | 效果 | 音效 |
|---:|---|---|---|
| 1 | `popIn(s, at, quiet)` | scale 0.85→1 + 淡入，`back.out(1.7)` | pop |
| 2 | `fadeIn(s, at)` | 上移 6px + 淡入（說明文字） | 無 |
| 3 | `stagger(list, at, gap)` | 同組依序 popIn，預設間隔 0.1 秒 | pop |
| 4 | `draw(s, at, dur)` | 線條描出，預設 0.5 秒 | draw |
| 5 | `travel(s, path, at, dur)` | 沿路徑移動 | travel |
| 6 | `swap(a, b, at)` | 舊元素淡出縮小，新元素在同位置 popIn | pop |
| 7 | `tick(s, at)` | 打勾標章彈出 | tick |
| 8 | `fill(s, at, dur)` | 進度條由左至右填滿 | fill |
| 9 | `type(sel, text, at, per)` | 逐字出現 | key |
| 10 | `ghost(s, at, dx, dy)` | 縮到 55%、移位、opacity 0.3（非文字元素用） | 無 |
| 11 | `ghostPill(s, at, dx, dy)` | 縮到 55%、移位、底色轉灰；字保持可讀 | 無 |
| 12 | `clear(list, at)` | 全部淡出 | 無 |

## 規則

- 上一個概念講完預設 ghost 到背景，不要直接消失；換章節時才 clear。
- 每個場景最後至少停 0.8 秒讓觀眾讀。
- 寫 `body.part` 前可以先列 shot list，每行「動作詞彙 + 元素」，例如：
  ```
  S2（T(2)）旁白：「先把程式送進檢查閘門。」
  - 章節膠囊 ghostPill 到左上
  - popIn APP 方塊
  - draw APP → 閘門的線
  - popIn 閘門；點 travel 過去
  ```
