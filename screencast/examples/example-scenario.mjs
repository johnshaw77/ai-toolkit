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
  // 不管 run.mjs 實際裝在哪台機器的哪個路徑。
  outDir: new URL('./out/example', import.meta.url).pathname,
  viewport: { width: 1440, height: 900 },
  // 某一步失敗要不要整支中止；預設 true。想錄「錯誤示範」教學時可以設 false，
  // 讓後面的步驟繼續跑，manifest.json 裡會標記哪一步是 ok:false。
  abortOnError: true,
  // 可省略；有設就用整支影片共用的音色/語速。voice 預設 zf_xiaobei（中文女聲），
  // 可用選項見 `npx hyperframes tts --list`。
  //
  // 換成 OpenAI（中文自然很多）：
  //   narration: { engine: 'openai', voice: 'nova' },
  // 換成自架／本地的 OpenAI 相容 TTS（例如 GPU 機上的語音克隆模型）：
  //   narration: { engine: 'openai-compatible', baseUrl: 'http://gpu-box:8000/v1',
  //                apiKeyEnv: 'LOCAL_TTS_KEY', voice: 'my-cloned-voice' },
  narration: { voice: 'zf_xiaobei', speed: 1 },
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
