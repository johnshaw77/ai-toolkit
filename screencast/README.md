# screencast

用 Playwright 操作網頁來錄操作教學影片，取代手動螢幕錄影。動作是程式碼、每次重跑結果都一樣，
不會有手抖 NG 重錄的問題；畫面上會疊一顆假游標（跟著真實的合成滑鼠事件移動）＋點擊漣漪，
讓觀眾看得出「點了哪裡」。

引擎跟任何專案都無關，**裝一份就好、不要複製進各專案**。每個專案只寫自己的 scenario 檔
（一份宣告式的 steps 清單），跑的時候指到 `~/.claude/skills/screencast/run.mjs`。

## 安裝（每台機器做一次）

```bash
# 1. 接上 Claude Code 的 skill 目錄（在 ai-toolkit repo 根執行）
ln -s "$PWD/screencast" ~/.claude/skills/screencast

# 2. 裝依賴（node_modules 不進版控，clone 下來一定要跑）
cd ~/.claude/skills/screencast
npm install
npx playwright install chromium   # 第一次跑要裝瀏覽器

# 3. 旁白配音要 ffmpeg
brew install ffmpeg
```

## 錄一支

在**目標專案**裡寫好 scenario 後：

```bash
node ~/.claude/skills/screencast/run.mjs scenarios/your-scenario.mjs
```

輸出位置由 scenario 自己的 `outDir` 決定（慣例是用 `import.meta.url` 算，讓影片黏在
scenario 檔旁邊而不是黏在引擎旁邊）：

- `demo.webm` 無聲影片
- `demo-narrated.webm` 疊了旁白配音的版本（每一步的停留時間照旁白長度自動抓，不用手動喬）
- `demo.srt` / `demo.vtt` 字幕（講稿跟時間戳錄的時候就有，不用跑語音辨識）
- `final.png` 最後一步的截圖
- `manifest.json` 每一步相對影片開頭的起訖毫秒數

⚠️ **每次跑都會把 `outDir` 整個刪掉重建**，不要把別的東西放進去。

舊的錄影要補字幕不用重錄：

```bash
node ~/.claude/skills/screencast/tools/manifest-to-srt.mjs <out 目錄>
```

## 換語音引擎

由 scenario 的 `narration` 欄位決定，預設是 OpenAI（`nova`，讀 `OPENAI_API_KEY`）。
要改試別家或自架的，只要那個服務有 OpenAI 相容的 `/v1/audio/speech` 端點，改這裡就好、
不用動引擎：

```js
narration: {
  engine: 'openai-compatible',
  baseUrl: 'http://<GPU 機>:8000/v1',
  apiKeyEnv: 'LOCAL_TTS_KEY',
  voice: 'my-cloned-voice',
},
```

換了引擎**影片會重新錄**，步調自動對齊新語速，字幕也跟著重算——這是刻意的，
不同引擎唸同一句話長度不一樣，沿用舊影片一定會對不齊。

⚠️ 本地 TTS 服務記得綁 `0.0.0.0` 而不是只綁 localhost，否則從別台機器連不到。

帳密走環境變數，不要寫進 scenario：

```bash
SCREENCAST_USER=xxx SCREENCAST_PASS=yyy node ~/.claude/skills/screencast/run.mjs scenarios/xxx.mjs
```

## 寫新的操作教學

複製 [`examples/example-scenario.mjs`](examples/example-scenario.mjs) 改 `steps` 陣列。
完整格式與四種 step type 說明見 [`SKILL.md`](SKILL.md)，或直接叫 Claude Code 用
`screencast` skill 幫你寫。
