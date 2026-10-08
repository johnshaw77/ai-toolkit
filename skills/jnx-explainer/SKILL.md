---
name: jnx-explainer
description: 把一段說明、流程或工具介紹做成 jnxstudio 品牌的繁中解說短片（MP4，15–40 秒）：品牌開場與結尾、edge-tts 旁白、BGM、依畫面事件自動配的音效。兩種畫面風格：dark-ui（深色 UI 卡片，模擬介面操作）與 line-icon（米白底線性 icon，講概念與流程）。用 HyperFrames 算圖。使用者說「做解說影片」「做一支介紹動畫」「jnx 影片」「把這個流程做成短片」時使用。
---

# jnx-explainer：jnxstudio 解說短片

每支影片的組成都一樣：**jnxstudio 開場 → 內容場景 → 收尾標語 → jnxstudio 結尾**，配 edge-tts 旁白、BGM 和音效。差別只在內容場景用哪種畫面風格。

成品一律用程式產生（HyperFrames + GSAP + SVG），不交給 AI 影片模型（字會糊、icon 會變形、時間點對不上旁白）。

## 選風格

| # | 風格 | 適合 | 範本 | 細節 |
|---:|---|---|---|---|
| 1 | dark-ui | 介紹工具或介面、模擬操作（終端機、聊天框、表單、App 視窗） | `templates/dark-ui/` | `styles/dark-ui.md` |
| 2 | line-icon | 講概念、架構、流程（A 送到 B、分岔、放行） | `templates/line-icon/` | `styles/line-icon.md` |

使用者沒指定時，依內容判斷；判斷不了就問一句。開工前先讀對應的 `styles/*.md`。

## 目錄

```
jnx-explainer/
├── SKILL.md            ← 本檔：共通流程、品牌、旁白、音效、HyperFrames 規則
├── setup.sh            ← 本機一次性設定（.venv + 繁中字型）
├── styles/             ← 兩種風格各自的配色、版面、動作詞彙、元件
├── templates/          ← 新影片從這裡複製
│   ├── dark-ui/        ← 步驟進度條 + Claude 轉圈（最完整的 dark-ui 範例）
│   └── line-icon/      ← 上線檢查閘門
├── examples/           ← 做過的影片（ci、codex、desktop、skill、sso、stepper、webex）
└── _archive/           ← 雲端搬來的原始壓縮檔（不進版控）
```

每個專案資料夾的檔案：

| # | 檔案 | 內容 |
|---:|---|---|
| 1 | `vo/gen.py`、`vo/v*.mp3` | 旁白稿與 edge-tts 產生的音檔，一句一檔 |
| 2 | `head.part` | SVG 骨架、CSS、配色、共用 helper、動作詞彙 `V.*`。通常不改 |
| 3 | `body.part` | 這支影片的場景與時間軸。每支影片主要改這個 |
| 4 | `build.py` | 讀 `index.tpl.html`，填 `__SC__ __TOTAL__ __WM__ __WMH__`，輸出 `flow/index.html`，並把繁中字型子集化 |
| 5 | `getsfx.py` | 用 Playwright（本機 Chrome）開 `flow/index.html`，把時間軸記錄的 `window.SFX` 存成 `sfx.json` |
| 6 | `audio.py` | 用 numpy 合成 `vo.wav`、`bgm.wav`、`sfx.wav` 到 `flow/assets/` |
| 7 | `wm.b64`、`wmh.txt` | jnxstudio 字標（base64 PNG 與高度）。dark-ui 是白字版，line-icon 是深字版 |
| 8 | `keys.npy` | 真實鍵盤打字取樣（打字音效用）。授權未確認，不進版控；檔案不在時 `audio.py` 改用合成的打字聲 |

py 檔都以自己所在的資料夾為基準（開頭 `D=…`），專案放在 `templates/` 或 `examples/` 底下都能跑；字型從 `../../fonts/` 讀。

## 環境

第一次先跑 `./setup.sh`：建立 `.venv/`（numpy、scipy、fonttools、playwright、pillow、edge-tts），並下載 Noto Sans CJK TC Bold／Medium 到 `fonts/`。另需 Node 22 以上、ffmpeg、Google Chrome。

## 製作流程

1. **寫旁白稿**：一句一個場景，每句 3 到 5 秒。最後一句是收尾標語。超過 6 句時，先把稿子給使用者確認。
2. **複製範本**：`cp -R templates/<風格> examples/<名稱>`，清掉 `vo/*.mp3`、`sc.json`、`sfx.json`、`flow/*.mp4`。
3. **產旁白**：改 `vo/gen.py` 的句子，在 `vo/` 裡跑 `../../../.venv/bin/python gen.py`。用 `afinfo vN.mp3` 取得每句秒數。
   - 聲音預設 `zh-TW-YunJheNeural`、`rate='+20%'`。女聲用 `zh-TW-HsiaoChenNeural`。
4. **填秒數**：把秒數填進 `build.py` 的 `vo=[…]`。場景起點 = 3.0（品牌開場）+ Σ(旁白秒數 + 0.3)；總長 = 最後一個起點 + 6.5（含品牌結尾）。
5. **寫 `body.part`**：每個場景一個群組 `G[n]`，時間軸用 `T(n)` 取該場景起點。所有動作都用 `V.*` helper，它們會自動記錄音效。品牌開場（S0）和結尾那段直接沿用範本。
6. **產出**（在專案資料夾裡）：
   ```
   cat head.part body.part > index.tpl.html
   ../../.venv/bin/python build.py
   ../../.venv/bin/python getsfx.py
   ../../.venv/bin/python audio.py
   cd flow && npx hyperframes@0.8.138 check
   npx hyperframes@0.8.138 snapshot --at <每個場景結束前 0.2 秒,…>
   npx hyperframes@0.8.138 render --output <名稱>.mp4
   ```
   新專案第一次跑 `getsfx.py` 時，`flow/assets/*.wav` 還不存在，會印出 3 個 `ERR_FILE_NOT_FOUND`，不影響結果；其他錯誤都要處理。
7. **看 snapshot**：逐張看 `flow/snapshots/contact-sheet-*.jpg`，確認元素都出現、文字沒被裁切、沒有重疊。修到 `check` 沒有 error 和 warning 再 render。唯一允許留著的是 lint 的 `composition_file_too_large`：dark-ui 刻意把整支影片放在單一 `index.html`（head.part + body.part），拆成 sub-composition 反而難改。
8. **交付**：成品在 `flow/<名稱>.mp4`（約 2 到 5 MB），附一行說明長度與場景數。

## 品牌（兩種風格共用）

- **開場（0–2.55 秒）**：logo 彈出、三個橢圓軌道描線、軌道轉動，字標由左往右展開；2.05 秒起紅色圓形轉場（iris）蓋滿畫面，2.55 秒從中間開洞進入內容。
- **結尾（最後 2.45 秒）**：收尾標語之後 iris 轉場，logo + 字標的品牌卡。
- logo 由 favicon.svg 重建：紅漸層 `#ff405b`→`#e20d32`、白環、3 個橢圓軌道。品牌紅 `#e8123a`。
- 相關 helper：`logo()`、`spin()`、`iris()`、`irisOpen()`，在兩個範本的 `body.part` 裡。

## 音效

- `V.*` helper 呼叫 `sfx(種類, 秒數, 長度)` 記錄事件，`getsfx.py` 取出後由 `audio.py` 合成。
- 種類：`pop`、`draw`、`travel`、`key`（真實鍵盤取樣）、`tick`、`ding`、`warn`、`chime`、`sting`（品牌）、`swipe`（轉場）、`fill`（不出聲）。
- 輕巧為主：pop／tick／ding／chime，不要吵的 whoosh。音量配比 vo 1.0、bgm 0.22、sfx 0.75。
- 自己寫的 tween 若需要聲音，手動補一行 `sfx(...)`。

## 共通的畫面原則

- 畫面 1920×1080，SVG `viewBox="0 0 1600 900"`；root `data-composition-id="main"`，`data-duration` = 總長。
- 畫面上只放名詞標籤（6 個中文字內），句子留給旁白。
- 狀態用顏色變化、進度條、計數器、打勾表達。
- 不放 emoji、真實品牌 logo 或知名角色（jnxstudio 除外）；要代表某產品時，用通用 icon 加文字標籤。

## HyperFrames 規則（違反會算出錯誤畫面）

- 只有一條 `gsap.timeline({paused:true})`，註冊在 `window.__timelines["main"]`；長度有限（結尾 `tl.set({}, {}, TOTAL)`）。
- 不能用 `Date.now`、`requestAnimationFrame`、`setTimeout`、CSS animation／transition、未設種子的亂數。
- 出場元素先 `opacity:0`，tween 用 `.to` 或 `immediateRender:false` 的 `.fromTo`。
- 每個專案只有一個根 `index.html`（放在 `flow/`）。素材只用本機檔案或 base64 data URI，不在算圖途中 fetch。

## GSAP／SVG 踩過的坑

- 對「已有 transform 屬性」的 SVG 元素 tween scale，會丟掉原本的 translate/scale → 外面包一層沒有 transform 的 `<g>` 再 tween。
- 巢狀且已縮放的群組上用 GSAP rotation，旋轉中心會跑掉 → 用 proxy 物件加 `onUpdate` 手動 `setAttribute("transform","rotate(a cx cy)")`。
- 沿路徑移動同理：用 proxy + `getPointAtLength` 設 `transform` 屬性。
- CSS class 的 stroke 會蓋掉 SVG 屬性 → 用 `element.style.stroke`。
- 疊放順序就是 DOM 順序；要把某群組拉到最上面，重新 append 到 `#world` 最後。
- id 不可重複（曾經因為兩個 `#ck3` 讓 tween 打到錯的元素）。
- 同一個屬性被「重複進行中的 tween」和「之後的 set」同時控制，set 不會贏 → 讓重複的 tween 在需要的時間點前自然結束。
- 隱藏元素的位置也會被版面檢查算進去：畫在 (0,0) 再靠 transform 移動的元素，會觸發 `container_overflow` → 一開始就給它起點的 transform。
- 變淡（opacity 0.3）的文字會被對比檢查擋下 → 要保留可讀就改用縮小 + 換底色（line-icon 的 `V.ghostPill`）。

## 放真實圖片或系統錄影時

- 圖片：先轉 base64 JPEG，放進 `<image id=… href="data:…">`，用 `<use>` 重複引用（見 `examples/codex`）。
- 錄影：先剪成需要的片段、預設靜音、必要時遮蓋敏感資訊並壓縮，再放進 `flow/assets/`，以 HyperFrames 的 `<video>` 規則嵌入。還沒做過，做之前先讀 hyperframes-core 的 media 章節。
