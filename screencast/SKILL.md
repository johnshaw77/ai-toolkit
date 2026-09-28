---
name: screencast
description: "Record an operational walkthrough / how-to video of a web app by driving it with Playwright instead of manual screen recording, so a shaky click never forces a full retake. Renders a fake cursor overlay with click ripples so viewers can see where each click lands, can synthesize per-step TTS narration (Traditional Chinese by default) and paces each step's pause to match the spoken line so voice and action stay in sync, then muxes the narration onto the video. Use when the user wants to record a tutorial, demo, or operational documentation ('操作型系統說明', '操作教學', 'screencast', '錄操作影片', 'record a walkthrough', '手抖 NG', 'automated screen recording', '配旁白', '轉語音') of any web app in any project — not specific to one codebase."
---

# screencast

跨專案共用的錄影工具。核心想法：把「要展示的操作」寫成一份宣告式的 steps 清單（像自動化測試腳本），
用 Playwright 重放，錄影 + 疊加假游標軌跡。動作是程式碼，每次重跑結果一致，不會手抖 NG 要整段重錄。

引擎（`lib/`、`run.mjs`）跟任何專案都無關，裝一份就好，**不要複製進各專案裡**——
每個專案只需要自己的 scenario 檔（steps 清單），跑的時候指到 `~/.claude/skills/screencast/run.mjs`。

> **正本在 `@Projects/ai-toolkit/screencast/`**，`~/.claude/skills/screencast` 是指過去的
> symlink，全機器只有這一份。引擎要進版控才不會改壞沒得回頭。
> 改這裡的檔案 = 改 ai-toolkit 那個 repo，記得 commit。

## 什麼時候用

使用者想要「錄一段操作教學 / demo / 系統說明影片」，尤其是提到手動螢幕錄影常常因為手抖、點錯
而要重錄的痛點。跟具體專案無關——這個 skill 在任何 web 專案都能用。

## 一次性設置（每台機器只需要做一次）

```bash
cd ~/.claude/skills/screencast    # symlink，實體在 @Projects/ai-toolkit/screencast
npm install                       # node_modules 不進版控，新機器一定要跑
npx playwright install chromium   # 沒裝過 Chromium 才需要
```

**要配旁白的話**，不管用哪個 TTS engine，疊音軌那步都要系統裝一份完整版 ffmpeg
（`brew install ffmpeg`）——Playwright 內附的 ffmpeg 是精簡版，沒有 libopus 編碼器。

用 `narration.engine: 'kokoro'`（本地、免費，中文音質普通）額外需要一個 Python venv。
**這個 venv 預設不存在**（不進版控——裡面寫死絕對路徑，跨機器搬會壞），要用 kokoro
才建。kokoro-onnx 吃 3.9–3.12，跟系統預設 Python 版本容易對不上，所以獨立裝一份，
不動系統環境：

```bash
cd ~/.claude/skills/screencast
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python kokoro-onnx soundfile
```

裝好之後 `lib/narration.mjs` 會自動透過 `HYPERFRAMES_PYTHON=.venv/bin/python` 呼叫
`npx hyperframes tts`，不用每次手動指定。

用 `narration.engine: 'openai'`（中文自然很多，推薦）不需要裝這個 venv，只要跑的時候
帶 `OPENAI_API_KEY` 環境變數就好。接自架的 TTS 用 `'openai-compatible'` + `baseUrl`，
一樣不用裝東西——詳見下方 narration 那節。

## 使用流程

1. **跟使用者確認要錄什麼**：目標網址、完整的操作序列（例如「登入 → 點 A → 填 B → 點送出」）、
   要用哪個帳號（測試帳號優先，不要用真實使用者的密碼）。不確定某一步的畫面長什麼樣，
   用 `claude-in-chrome` 或 `chrome-devtools-mcp` 先手動走一次，記下要點的文字/selector。

2. **在目標專案裡寫一份 scenario 檔**（不是在這個 skill 目錄下！）。參考
   `examples/example-scenario.mjs` 的格式，通常放在該專案一個明顯的地方（例如
   `lab/screencast/scenarios/`，或使用者指定的目錄）。五種 step type：

   | type | 欄位 | 說明 |
   |---|---|---|
   | `goto` | `url`, `waitUntil`, `label` | 導覽；`url` 可以是完整網址，也可以是相對路徑（接在 `scenario.baseUrl` 後面） |
   | `fill` | `selector`\|`role`+`name`\|`placeholder`, `value`, `label` | 定位輸入框後清空、打字（有打字動畫） |
   | `click` | `selector`\|`role`+`name`\|`placeholder`\|`text`, `label` | 移動游標（平滑、非瞬移）→ 漣漪 → 點擊 |
   | `waitFor` | `selector`\|`role`+`name`\|`placeholder`\|`text`, `state`, `timeout`, `label` | 等某個元素出現（`state` 預設 `visible`，也可以 `hidden`／`attached`／`detached`） |
   | `wait` | `ms`, `label` | 純停留，讓畫面有時間被看清楚 |

   定位方式（依優先順序取第一個有寫的），**選最不會撞到頁面上其他元素的那種**：
   - `selector`：CSS selector，最穩。
   - `role`+`name`：ARIA role 加可見名稱，名稱做「包含」比對，括號加號等特殊字元不用跳脫。
     要完全相同加 `exact: true`；要 regex 就直接傳 RegExp（`name: /^送出$/`）。
   - `placeholder`：輸入框的 placeholder，填表單最好用。
   - `text`：可見文字。容易連父層或同樣文字的標題一起選到，這時候改用 `role`+`name`
     （例如登入按鈕文字跟頁面標題都含「登入」時）。**`fill` 不吃 `text` 定位**——
     fill 要打的字寫在 `value`（舊 scenario 寫在 `text` 也照樣當內容用）。

   **等畫面載入用 `waitFor`，不要用 `wait` 猜毫秒數。** 按下送出後結果要等 API 回來才出現，
   `{ type: 'waitFor', text: '儲存成功' }` 會等到它真的出現（最久 `scenario.timeout`，預設 15 秒）。

   `goto` 預設等到 `load`，再最多等 2 秒網路安靜。以前固定等 `networkidle`，遇到有輪詢或
   WebSocket 的系統會卡到逾時。真的需要可以設 `scenario.waitUntil` 或 step 的 `waitUntil`
   （`'load'`／`'domcontentloaded'`／`'networkidle'`／`'commit'`）。

   **任何一種 type 都可以再加一個 `narration: '一句口白'`。** 有 narration 的步驟會：
   合成語音 → 量出實際秒數 → 動作做完後用這個秒數當停留時間（`wait` 型步驟則完全用這個
   秒數取代 `ms`）。步調自然跟著講稿走，不用自己猜要 `wait` 幾毫秒，也不會有畫面跟聲音
   對不齊的問題。錄完會多一支疊好音軌的 `demo-narrated.webm`。

   `scenario.narration = { engine, voice, speed }` 設整支影片共用的語音引擎/音色：

   | engine | 品質 | 費用 | 需要 |
   |---|---|---|---|
   | `'kokoro'`（預設） | 中文機械感重，能聽但不自然 | 免費、本地 | 上面那個 `.venv` |
   | `'openai'`（推薦中文內容用這個） | 自然很多 | 便宜（`gpt-4o-mini-tts`，一支教學影片幾分錢等級） | 環境變數 `OPENAI_API_KEY` |
   | `'openai-compatible'` | 看你接什麼 | 本地跑就免費 | 一個講 OpenAI TTS 協定的端點 |

   **`'openai-compatible'` 跟 `'openai'` 是同一段程式**，差別只在語意上標明「這不是
   OpenAI 本尊」。網址靠 `baseUrl` 指定，所以任何提供 `/v1/audio/speech` 的服務都能直接接上：

   ```js
   narration: {
     engine: 'openai-compatible',
     baseUrl: 'http://<你的 GPU 機>:8000/v1',  // 預設 https://api.openai.com/v1
     apiKeyEnv: 'LOCAL_TTS_KEY',               // 預設 OPENAI_API_KEY；本地服務通常不用驗
     voice: 'my-cloned-voice',
     model: 'whatever-the-server-calls-it',
   },
   ```

   本地跑的中文 TTS（openedai-speech、Fish Speech，或自己包一層 FastAPI 的 IndexTTS /
   CosyVoice）大多有這個相容端點；沒有的話，包一層三十行的 HTTP wrapper 就好——
   這邊對 TTS 的要求只有「文字進、音檔出」，長度是收到檔案後自己 ffprobe 量的。

   **旁白有快取**：同一句話、同樣參數（engine、voice、model、speed、baseUrl…）合成過就直接用，
   放在 `~/.cache/screencast/tts`（`SCREENCAST_CACHE_DIR` 可改）。調 selector 重錄不會重複
   付費或等待。`narration.cache: false` 關掉；TTS 服務端換了模型但參數沒變時要記得關掉或
   刪快取，不然會拿到舊聲音。

   API key 的規則：**官方網址一定要有**（沒有直接報錯，不會送出去才發現）；
   自訂 `baseUrl` 則是有就帶 `Authorization`、沒有就不帶。

   `voice` 依 engine 而不同：`kokoro` 用 `npx hyperframes tts --list` 列出的 ID（預設
   `zf_xiaobei`，中文女聲）；`openai` 用官方語音 ID（`alloy`/`echo`/`fable`/`nova`/
   `onyx`/`shimmer`……），中文內容目前試過 `nova` 效果不錯。範例：

   ```js
   narration: { engine: 'openai', voice: 'nova' },
   ```

   跑的時候記得帶 `OPENAI_API_KEY`（不要寫死在 scenario 檔裡）：

   ```bash
   OPENAI_API_KEY=sk-... node ~/.claude/skills/screencast/run.mjs scenarios/xxx.mjs
   ```

3. **先 dry-run，再正式跑**：

   ```bash
   node ~/.claude/skills/screencast/run.mjs --dry-run <scenario 檔路徑>   # 幾秒，確認都對得到
   node ~/.claude/skills/screencast/run.mjs <scenario 檔路徑>             # 正式錄
   ```

   dry-run 不錄影、不合成語音、游標不做動畫，也**不動 outDir**（輸出放在系統暫存資料夾，
   路徑會印出來），有失敗一樣會存 `error-step-N.png`。有步驟失敗時兩者的 exit code 都是 1。

   輸出固定在 scenario 檔旁邊的 `out/<資料夾名>/`（由 scenario 的 `outDir` 決定）：
   - `demo.webm` — 錄影（無聲）
   - `demo-narrated.webm` — 疊了旁白音軌的版本（有 `narration` 才會產生）
   - `demo.mp4` — H.264＋AAC，有旁白就帶聲音。**要交給別人看就給這個**，`.webm` 在
     PowerPoint、LINE、Teams、Windows 常常播不了。`output: { mp4: false }` 關掉
   - `narration/step-N.wav` — 每句旁白的原始音檔
   - `demo.srt` / `demo.vtt` — 字幕（有 `narration` 才會產生）
   - `final.png` — 最後一步的截圖
   - `manifest.json` — 每一步相對影片開頭的起訖毫秒數，外加旁白自己的
     `narrationStartMs` / `narrationDurationMs`
   - 若某步失敗：`error-step-N.png`

   outDir 會被整個刪掉重建，但有防呆：裡面有不是 screencast 產出的東西（沒有
   `.screencast-out` 標記檔、也沒有 `manifest.json`）就拒絕執行，不會刪。

4. **檢查 manifest.json**，確認每一步 `ok` 都是 `true`。有步驟失敗就看對應的
   `error-step-N.png` 截圖，通常是 selector/文字沒對到（改用另一種定位方式）或畫面還沒載完
   （加一個 `wait` 步驟）。改完 scenario 直接重跑，不用擔心錄壞——每次都是全新開始。

5. **要讓使用者在手機/其他裝置上看**：`.webm` 不方便直接傳檔案預覽，包成一個帶
   `<video>` 標籤的 Artifact 頁面最方便（`Artifact` 工具的 `files` 參數可以把 `.webm`
   當成 supporting file 一起發布）。單純想丟原始檔案才用 `SendUserFile`。

## 字幕

有旁白就自動產出 `demo.srt` 與 `demo.vtt`，**不需要跑語音辨識**——講稿跟時間戳錄的時候
就都在手上了。兩種格式都給：`.srt` 給剪輯軟體與上字幕工具，`.vtt` 給網頁
`<video><track>`（`.webm` 不吃外掛 `.srt`，包成 HTML 分享時要的是 `.vtt`）。

```js
subtitles: { enabled: false }        // 關掉
subtitles: { maxCharsPerCue: 24 }    // 一張字卡幾個字，預設 18
```

**時間軸不等於 step 的時間軸。** 引擎是「動作做完 → 才開始播旁白」，所以旁白起點在
step 中間，差的就是那段操作時間（實測過一支：step 從 0ms 開始，旁白其實 1752ms 才進來）。
拿 `tStartMs` 當字幕起點會整句提早出現，要用 `narrationStartMs`。

一句話超過 `maxCharsPerCue` 會在標點處切成多張字卡，時間**按字數比例分配**。這是估算——
只知道整句音檔多長，不知道每個字唸多久。一般操作教學夠用；要逐字精準（卡拉 OK 式高亮）
得另外跑 forced alignment，這裡不做。

### 給舊影片補字幕（不用重錄）

```bash
node ~/.claude/skills/screencast/tools/manifest-to-srt.mjs <out 目錄>
```

manifest 有 `narrationStartMs` 就直接用；舊版沒存的話，`ffprobe` 量
`narration/step-N.wav` 的長度，從 `tEndMs` 往回推——因為引擎會等旁白講完才進下一步，
旁白結束點就等於 step 結束點。

### 把字幕放進影片

```bash
# 軟字幕軌（可開關，不需要 libass）
ffmpeg -i demo-narrated.webm -i demo.vtt -map 0 -map 1 -c copy -c:s webvtt \
  -metadata:s:s:0 language=zho demo-subbed.webm
```

要**燒進畫面**（硬字幕）得用 `-vf subtitles=demo.srt`，但那需要 ffmpeg 編了 libass ——
`ffmpeg -filters | grep subtitles` 沒東西就是沒有，得換一份有 `--enable-libass` 的組建。

## 已知限制 / 踩過的坑

- **游標是注入的 DOM 覆蓋層，不是真的滑鼠錄影**——用 `context.addInitScript` 注入，
  監聽 Playwright 送出的合成 `mousemove` 定位。兩個容易讓它「完全不出現」的坑，
  `lib/cursor-overlay.mjs` 裡已經修掉，改動這份檔案時要留意別踩回去：
  1. `addInitScript` 在 `document_start` 執行時 `document.documentElement` 有時還是
     `null`，直接操作會整段 script 丟例外、後面全部不執行。但也**不要**用
     `requestAnimationFrame` 重試到它出現才整段初始化——headless 忙的時候 rAF 會拖到
     load 之後，這段期間的 mousemove 全部漏接。現在的做法：`mousemove` 監聽一開始就
     掛在 `window`，只有把 DOM 掛上去這件事等 `DOMContentLoaded`。
  2. 掛在 `document.body` 而非 `document.documentElement`，容易被頁面框架某層容器的
     CSS `transform` 影響，讓 `position: fixed` 的定位基準跑掉，游標飄到看不到的地方。
- 游標位置記在 `sessionStorage`，點連結換頁後新頁面會把游標放回原位；跨網域換頁
  拿不到（sessionStorage 分網域），游標會等下一次移動才出現。
- `page.video().saveAs()` 要在 `context.close()` 之後、`browser.close()` 之前呼叫，
  順序反了會丟 `Target page, context or browser has been closed`。
- 改引擎之後跑 `npm test`（單元＋端對端，離線，本地 fixture 網頁＋假 TTS）。
- 目前只支援單一組登入資訊、單一分頁的線性流程；多分頁、跳出視窗、iframe 內操作等
  複雜情境沒驗證過，遇到了先手動測一輪確認可行再寫進 scenario。
- 旁白目前只支援「照順序、不重疊」——一句唸完才進下一步，不支援兩句同時疊音或
  跨步驟接話。夠用於一般操作教學，不夠用於需要精準卡點的旁白（例如唸到一半要剛好
  點下按鈕）這種情況要自己微調 `narration` 文字長度去湊時間。
- kokoro-onnx 對繁體中文是用注音/拼音 phonemizer 處理，罕見字或英文夾雜中文的句子
  發音可能不準——錄完務必聽一次，不要無檢查就發布。
