# screencast

用 Playwright 操作網頁來錄操作教學影片，取代手動螢幕錄影。動作是程式碼、每次重跑結果都一樣，
不會有手抖 NG 重錄的問題；畫面上會疊一顆假游標（跟著真實的合成滑鼠事件移動）＋點擊漣漪，
讓觀眾看得出「點了哪裡」。

引擎跟任何專案都無關，**裝一份就好、不要複製進各專案**。每個專案只寫自己的 scenario 檔
（一份宣告式的 steps 清單），跑的時候指到 `~/.claude/skills/screencast/run.mjs`。

## 安裝（每台機器做一次）

最省事的是在 Claude Code 裡直接說：

```
照 github.com/johnshaw77/ai-toolkit 的 README 幫我裝 screencast
```

自己動手的話，Mac、Windows 的完整步驟見 [repo 根的 README](../README.md#2-screencastskill)。
裝完跑：

```bash
npm run doctor     # 缺什麼會直接印出要跑的指令
```

## 錄一支

在**目標專案**裡寫好 scenario 後，先用 dry-run 確認每一步都對得到元素（不錄影、
不合成語音、不動輸出資料夾，幾秒就跑完），再正式錄：

```bash
node ~/.claude/skills/screencast/run.mjs --dry-run scenarios/your-scenario.mjs
node ~/.claude/skills/screencast/run.mjs scenarios/your-scenario.mjs
```

有步驟失敗時 exit code 是 1。

開了 zoom 的話，之後只調倍率、改哪幾步要推近，不用重錄：

```bash
node ~/.claude/skills/screencast/run.mjs --zoom-only scenarios/your-scenario.mjs
```

輸出位置由 scenario 自己的 `outDir` 決定（慣例是用
`fileURLToPath(new URL('./out/xxx', import.meta.url))` 算，讓影片黏在 scenario 檔旁邊；
不要用 `new URL(...).pathname`，Windows 上會是壞掉的路徑）：

- `demo.webm` 無聲影片
- `demo-narrated.webm` 疊了旁白配音的版本（每一步的停留時間照旁白長度自動抓，不用手動喬）
- `demo.mp4` H.264 版本（有旁白就帶聲音）——**要給同事看就給這個**，`.webm` 在
  PowerPoint、LINE、Teams、Windows 常常播不了
- `demo.srt` / `demo.vtt` 字幕（講稿跟時間戳錄的時候就有，不用跑語音辨識）
- `demo-zoomed.mp4` 鏡頭推近／平移的版本（scenario 設 `autoZoom: true` 或步驟加 `zoom` 才有）
- `final.png` 最後一步的畫面截圖
- `manifest.json` 每一步相對影片開頭的起訖毫秒數

⚠️ **每次跑都會把 `outDir` 整個刪掉重建**，不要把別的東西放進去。有防呆：outDir
裡有不是 screencast 產出的東西時會拒絕執行，不會刪。

舊的錄影要補字幕不用重錄：

```bash
node ~/.claude/skills/screencast/tools/manifest-to-srt.mjs <out 目錄>
```

## 換語音引擎

由 scenario 的 `narration.engine` 決定，建議依這個順序挑（細節與設定範例見 SKILL.md）：

| # | engine | 說明 |
|---:|---|---|
| 1 | `edge`（預設） | 微軟曉臻，台灣腔、免費、任何平台；要連網，講稿會送到微軟 |
| 2 | Breeze-TTS-2 | 台灣華語開源模型，本地跑，**只有 Apple Silicon Mac**，慢 |
| 3 | Qwen3-TTS | 中文自然但大陸腔，本地跑，**只有 Apple Silicon Mac** |
| 4 | `openai` | 付費、要 `OPENAI_API_KEY` |
| 5 | `kokoro` | 本地免費，但中文唸得很亂，不建議 |

2、3 是透過 mlx-audio 起一個 OpenAI 相容的 server，scenario 用
`engine: 'openai-compatible'` 指過去。任何提供 `/v1/audio/speech` 的服務（例如 GPU 機上
自架的模型）都能用同樣方式接：

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

同一句話、同樣參數合成過就會用快取（`~/.cache/screencast/tts`），調 scenario 重錄
不會重複付費。要強制重新合成就設 `narration.cache: false`。

⚠️ 本地 TTS 服務記得綁 `0.0.0.0` 而不是只綁 localhost，否則從別台機器連不到。

帳密走環境變數，不要寫進 scenario：

```bash
SCREENCAST_USER=xxx SCREENCAST_PASS=yyy node ~/.claude/skills/screencast/run.mjs scenarios/xxx.mjs
```

## 開發

```bash
npm test    # 單元＋端對端，全部離線：本地 fixture 網頁＋假 TTS，不花錢
```

端對端測試會真的開 Chromium 錄影並用 ffmpeg 轉檔，需要先做完上面的安裝步驟。

## 寫新的操作教學

複製 [`examples/example-scenario.mjs`](examples/example-scenario.mjs) 改 `steps` 陣列。
完整格式與五種 step type 說明見 [`SKILL.md`](SKILL.md)，或直接叫 Claude Code 用
`screencast` skill 幫你寫。
