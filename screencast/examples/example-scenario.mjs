// 範本：複製這個檔案到「目標專案」裡（不是這個 skill 目錄），改 steps。
// 跑法： node ~/.claude/skills/screencast/run.mjs <這個檔案的路徑>
//
// 先 dry-run 確認每一步都對得到（幾秒、不錄影、不花 TTS 錢）：
//   node ~/.claude/skills/screencast/run.mjs --dry-run <這個檔案的路徑>
//
// 定位元素的方式，選最不會跟頁面上其他東西混淆的：
//   selector    — CSS selector，例如 'input[name="email"]'
//   role+name   — ARIA role + 可見文字，例如 role:'button', name:'送出'
//                 （包含比對；括號、加號不用跳脫；要完全相同加 exact:true）
//   placeholder — 輸入框的 placeholder，填表單最方便
//   text        — 純文字比對（getByText），適合連結/純文字按鈕，但要小心撞到
//                 包含同樣文字的父層元素（例如標題裡也有這幾個字）。fill 不能用這個
//                 定位——fill 要打的字寫在 value
export const scenario = {
  baseUrl: 'https://example.com',
  // outDir 用 import.meta.url 算相對路徑，輸出會固定在這個 scenario 檔旁邊，
  // 不管 run.mjs 實際裝在哪台機器的哪個路徑。要用 fileURLToPath，不要用
  // new URL(...).pathname——後者在 Windows 上是 /C:/... 這種壞掉的路徑。
  outDir: fileURLToPath(new URL('./out/example', import.meta.url)),
  viewport: { width: 1440, height: 900 },
  // 某一步失敗要不要整支中止；預設 true。想錄「錯誤示範」教學時可以設 false，
  // 讓後面的步驟繼續跑，manifest.json 裡會標記哪一步是 ok:false。
  abortOnError: true,
  // 可省略；有設就用整支影片共用的音色/語速。engine 不寫就是 edge（微軟曉臻，
  // 台灣腔，任何平台都能用，需要 `uv tool install edge-tts`）。
  // 其他台灣音色：zh-TW-HsiaoYuNeural（曉雨，女）、zh-TW-YunJheNeural（雲哲，男）。
  //
  // 講稿不能送出公司、而且是 Apple Silicon Mac 的話，改用本地的 Breeze-TTS-2
  // （先照 SKILL.md 啟動 mlx-audio server）：
  //   narration: { engine: 'openai-compatible', baseUrl: 'http://127.0.0.1:8765/v1',
  //                model: 'mlx-community/Breeze-TTS-2-mlx',
  //                extraBody: { instruct: '一位語氣溫和、咬字清楚的台灣年輕女性' } },
  narration: { voice: 'zh-TW-HsiaoChenNeural', speed: 1 },
  // 可省略。點擊、輸入時鏡頭自動推近，另外輸出 demo-zoomed.mp4（原本的 demo.mp4 照樣保留）。
  // 個別步驟可以加 zoom: 2.5 指定倍率、zoom: false 不推近。
  // 之後只想調 zoom 不用重錄：run.mjs --zoom-only <這個檔案>
  autoZoom: true,
  // 可省略。假游標大小，預設放大 1.5 倍（36px）；要更大就調 scale。
  cursor: { scale: 1.5 },
  // 可省略。有旁白就自動產出 demo.srt / demo.vtt，這裡只是調整或關掉。
  subtitles: { enabled: true, maxCharsPerCue: 18 },
  steps: [
    {
      type: 'goto', url: '/login', label: '打開登入頁',
      narration: '這裡示範怎麼登入系統並打開設定頁。首先我們打開登入頁。',
    },
    { type: 'fill', selector: 'input[name="email"]', value: 'user@example.com', label: '輸入帳號' },
    { type: 'fill', placeholder: '密碼', value: 'hunter2', label: '輸入密碼' },
    {
      type: 'click', role: 'button', name: '登入', label: '點登入',
      narration: '輸入帳號密碼之後，點擊登入。',
    },
    // 等登入後的畫面真的出來，不要用 wait 猜要幾毫秒
    { type: 'waitFor', role: 'heading', name: '首頁', label: '等首頁載入' },
    {
      type: 'click', text: '設定', label: '點「設定」',
      narration: '登入後點擊設定，就能進到個人偏好設定頁。',
    },
    { type: 'wait', ms: 1200, label: '停留讓畫面看清楚' },
  ],
};
