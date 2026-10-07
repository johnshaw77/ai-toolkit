# 決策紀錄

追加式，不改寫既有條目。過去的判斷即使後來被推翻，也是有用的脈絡。

---

## 2026-09-17　三個工具收成一個 repo

### 為什麼不做成 monorepo（pnpm workspace / npm packages）

三個東西的形態根本不同：unattended 是 Claude Code plugin（bash + markdown，沒有
`package.json`）、screencast 是 skill（Node + Playwright）、smart-scaffold 是 Python CLI
（uv + hatchling）。硬套一套 JS 的 workspace 只會讓兩個非 JS 的專案多背一層它們用不到的東西。

**代價**：沒有統一的 `install` 指令，README 要列三種裝法。可接受——三者本來就是各自獨立安裝的。

### 為什麼還是加了 `.claude-plugin/marketplace.json`

使用者要的是「純資料夾集合」，但 unattended **已經是**用 marketplace 散佈的 plugin，
同事拿 `johnshaw77/claude-unattended-workflow` 這個網址裝。搬家不處理這條，
舊 repo 就會變成必須繼續維護的第二份正本，正是這次要消滅的東西。

根目錄加一個 json 檔不改變「資料夾集合」的性質，卻保住了唯一的散佈管道。

### 為什麼保留 git 歷史（subtree 而不是 cp）

unattended 有 30+ 顆 commit，很多訊息記著「為什麼這樣寫」（fd 紀律、
`printf | grep -q` 的 SIGPIPE 坑、看門狗的孤兒 process）。那些是踩過才知道的東西，
複製檔案就丟了。

**代價**：`git log` 混入三條無關歷史，且 `git log -- <子目錄>` 因為歷史簡化只顯示
merge commit，要查得加 `--full-history`。這一點寫進了根 README。

### screencast 少一層：`engine/` 的內容直接放在 `screencast/`

原本是 `lab/screencast/engine/`，因為要跟同目錄的 `scenarios/`、`out/` 並存。
搬過來後 scenarios 留在各專案，這一層就沒有意義了，而且 `SKILL.md` 放在
`screencast/` 根正好讓 `~/.claude/skills/screencast` 直接指過來。

用 `git subtree split --prefix=lab/screencast/engine` 切出來，正好只含 engine 的歷史。

### install-bin.sh 的偵測改成「往下找一層」而不是寫死新路徑

plugin 根不再等於 marketplace 根。最省事的改法是把 fallback 直接改成新路徑，
但那樣就是把同一個假設換個位置再寫死一次。改成對每個 `installLocation`
試自己與往下一層（`find_plugin_root()`），順便讓「一個 marketplace 放多個 plugin」
這件事以後不用再改這支腳本。

舊的 `claude-unattended-workflow` fallback 路徑**刻意留著**當第二順位：
還沒換 marketplace 的人不會因為這次搬家突然壞掉。

### 為什麼先 commit smart-scaffold 才搬

搬之前 `@SideProjects/smart-scaffold` 有 17 個改檔 + 未追蹤的 `templates/web/`
（整個 web preset，39 個檔案）沒進版控。`git subtree` 只搬 commit 不搬 working tree，
不先 commit 就會整包消失。

這是整件事最容易出意外的一步，所以排在步驟 0。

---

## 2026-09-28　unattended 0.24.0：準備推給團隊前補的兩個洞

背景：打算把 plugin 推給部門同仁（技術棧 Python 為主、少量 Node、前端 Vue）。
從「別人來用」的角度重看，挑了推廣前一定要先補的兩件事，其餘（分層安裝、規則外移成
markdown、跨專案狀態指令）留到之後。

### 最傷的禁令改由 PreToolUse hook 攔，不再只靠注入的文字

「永遠不 push」「不要 down -v」「無人值守不動 main」原本只寫在 session-start 注入的
準則裡。自己用可以接受「模型偶爾不聽」的風險；一群人用、而且 `--loop` 是
`bypassPermissions`，這個機率會被放大。

互動時回 `ask` 而不是 `deny`：互動開發本來就可能要 push（使用者明說時），
一律 deny 只會讓人把 hook 關掉。無人值守時沒人能按確認，所以 `deny`。

**代價**：攔不到 `bash -c`、腳本檔裡的指令；也可能有極少數怪寫法誤判。
刻意不去做完整的 shell 解析——它是安全網，不是沙箱。

### 守門員找 pytest 的方式

原本只看 PATH 上的 `pytest`。Python 專案的 pytest 幾乎都在 `.venv` 或靠 `uv run`，
結果是**測試整段沒跑、而且放行**——正好是這個守門員最該避免的安靜放行，
而且對以 Python 為主的團隊是每次都會踩到。

找不到 pytest 時的處理分兩種：有測試檔 → 擋；沒有測試檔 → 維持放行。
後者是為了不讓沒寫測試的小專案每次都被擋。

**代價**：`uv run pytest` 在 pytest 不是依賴時會失敗並擋下——這是想要的行為，
但訊息是 uv 的原文，不是我們的說明。

---

## 2026-09-28　unattended 0.25.0：守門員在互動模式不跑測試

### 起因

實際使用時會在專案加 `.claude/.no-verify`，因為每個回合結束都要等整套測試跑完，
而 agent 自己通常已經跑過一次。但 `.no-verify` 是整個關掉——連「改了 UI 卻沒開
瀏覽器」「改了 API 卻沒打 endpoint」也一起關掉，而那兩項是測試抓不到的，也是
無人值守時唯一的防線。

守門員做三件事，貴的只有一件（重跑測試）。所以拿掉貴的，留下便宜的。

### 互動模式：完全不跑測試（選項 B）

另一個選項（A）是互動模式也照「agent 沒跑才補跑」的規則。選 B 是因為互動時常常是
「先改一半、還不想測」，使用者在場可以自己判斷。

**代價**：互動模式下 agent 改完沒跑測試就回報，守門員不會發現。靠注入的
Web／後端完成定義要求它自己跑。

### 無人值守：agent 跑過且成功就不重跑

判斷依據是 transcript：最後一次改這個專案的檔案之後，有沒有對應的測試指令、
而且 `tool_result` 沒有 `is_error`。指令含 `|` 或 `;` 不算，因為 exit code 會被
後面的指令蓋掉。

**代價**：agent 在改檔後跑了**部分**測試（例如 `pytest tests/test_x.py`）也會被信任。
接受這個代價——要求一定跑全套，會回到每回合重跑的老問題；而且下一項改檔後
又會重新判斷。


---

## 2026-09-28　screencast：補測試網與第一輪優化

### 測試用 `node:test`，fixture 網站與假 TTS 都在本地

不加測試框架（Node 22 內建的就夠）。端對端測試對一個本地 fixture 網頁跑完整 scenario，
TTS 則由同一個本地 server 假扮 OpenAI 相容端點、回靜音 wav。這樣測試離線可跑、
不花錢、結果可預測。

**代價**：沒測到 kokoro 路徑與真正的 OpenAI；假 TTS 的 wav 跟真實回應格式可能有差。
真實網站的相容性改用 `--dry-run` 手動驗。

### `fill` 的輸入內容改叫 `value`，但 `text` 繼續當內容用

`text` 同時是「定位用的可見文字」和「fill 要打的字」，fill 沒寫 selector 時會拿
要打的字去頁面上找元素。改成 fill 一律不拿 `text` 定位（沒有定位方式就明確報錯），
內容優先讀 `value`、沒有才讀 `text`。另加 `placeholder` 定位，輸入框最常用的就是它。

**代價**：fill 不能再用可見文字定位輸入框（本來就不合理，輸入框沒有可見文字）。
舊 scenario 全部相容。

### `role` 的 `name` 字串改成跳脫後比對

以前直接 `new RegExp(name)`，「儲存 (Ctrl+S)」這種名稱會比對失敗。字串一律跳脫、
維持「包含」語意；真的要 regex 就傳 RegExp 物件，要完全相同就加 `exact: true`。

**代價**：如果有舊 scenario 故意在字串裡寫 regex（例如 `name: '^送出$'`），行為會變。
目前已知的 scenario 都沒有這樣寫。

### `goto` 預設等到 `load`，再盡量等 networkidle 兩秒

以前固定 `networkidle`，有輪詢或 WebSocket 的頁面會一路卡到 30 秒逾時（fixture 實測
確認會逾時）。改成 load 之後再最多等兩秒網路安靜：一般 SPA 的初始資料在這段時間
會回來，永遠不安靜的頁面也只多等兩秒。可用 `scenario.waitUntil` 或 step 的
`waitUntil` 改回來。非同步載入的內容改用新的 `waitFor` step 等，不要猜毫秒數。

**代價**：輪詢頁的每次 goto 固定多 2 秒。

### TTS 快取放在 `~/.cache/screencast/tts`，不放在 outDir

outDir 每次錄都會整個刪掉，放裡面等於沒快取。key 是文字＋所有影響聲音的參數
（engine、voice、model、speed、baseUrl、format、extraBody）的 sha256；`apiKeyEnv`
不算。`openai` 與 `openai-compatible` 視為同一種。

**代價**：快取不會自己清，會慢慢長大（一句話約幾十 KB，一年錄幾百支也才幾十 MB）。
TTS 服務端換了模型但參數沒變時會拿到舊聲音——要重錄新聲音就設 `cache: false`
或刪快取資料夾。

### 預設多轉一份 `demo.mp4`

`.webm` 在 PowerPoint、LINE、Teams、公司的 Windows 電腦常常播不了，而影片的觀眾是
非技術同事。H.264＋AAC、yuv420p、`+faststart`。

**代價**：每支多花幾秒編碼；不要的話設 `output: { mp4: false }`。

### outDir 只刪「看得出是自己產出的」資料夾

以前 `fs.rmSync(outDir)` 不做任何檢查，outDir 不小心指到專案根目錄就全刪光。
現在建立 outDir 時放一個 `.screencast-out` 標記檔，只有空資料夾、有標記檔，或有
舊版留下的 `manifest.json` 才會刪；其他情況在開瀏覽器前就報錯。

**代價**：之前手動建好、放了別的東西的資料夾不能直接當 outDir。不在原本談好的範圍內，
但這是不可逆的資料損失，成本只有十幾行，所以一起做了。

### 游標 overlay 不再用 requestAnimationFrame 等 documentElement

平行跑測試時抓到的：documentElement 還是 null 時，以前會用 rAF 重試到它出現才
「整段」初始化，headless 在忙的時候 rAF 會拖到頁面 load 之後，這段期間的
mousemove 全部漏接。現在監聽器一開始就掛在 window，只有「把 DOM 掛上去」這件事
等 DOMContentLoaded。另把游標最後位置記在 sessionStorage，點連結換頁後游標
留在原位，不會消失到下一次移動才出現。

---

## 2026-09-28　screencast：預設語音改成 edge（微軟曉臻）

### 為什麼是 edge 首選、Breeze 次之、Qwen3 最後

這是使用者聽過試聽檔後定的順序。理由：團隊不是每個人都有 Mac，而 edge 在 Windows
也能用；曉臻是台灣腔，中英夾雜唸得自然；免費、免 key，一句 2–3 秒。Breeze-TTS-2
也是台灣腔、而且完全本地，但只能在 Apple Silicon 上跑（mlx-audio），又慢（約 6 倍於
即時）。Qwen3-TTS 快，但是大陸腔。kokoro 的中文使用者評為「一團亂」。

**代價**：
- 沒寫 `narration.engine` 的 scenario 從 kokoro 變成 edge。要沿用 kokoro 得明寫。
- edge 要連網，講稿會送到微軟。
- edge-tts 借用的是 Edge「大聲朗讀」的介面，不是微軟公開的 API，哪天可能壞掉或被擋。
  壞了的退路是 Breeze（Mac）或 openai-compatible 接 GPU 機，所以這兩條路都留著、
  也寫進 SKILL.md。

### edge 用 Python 的 edge-tts CLI，不用 npm 套件

npm 上有幾個 Edge TTS 的移植，但微軟改過好幾次驗證方式（Sec-MS-GEC token 等），
Python 版 edge-tts 是跟得最快的。`uv tool install edge-tts` 在三個平台都是同一行，
uv 自己處理 Python。

**代價**：多一個非 npm 的依賴，每台機器要多跑一行安裝；呼叫是 execFileSync，
每句多一點 process 啟動時間（實測一句 2–3 秒，可忽略）。

### Breeze / Qwen3 不寫專用 engine，走 openai-compatible

mlx-audio 本身就有 OpenAI 相容的 server，`extraBody` 能帶 `instruct`、`lang_code`，
不需要新程式碼，只要文件寫清楚怎麼啟動與設定。venv 放在 `.venv-mlx`，跟 kokoro 的
`.venv` 分開，避免 numpy 等依賴衝突。

### 本地 TTS 的請求改用 node:http，逾時預設 10 分鐘

試 Qwen3 1.7B 與 Breeze 時抓到：內建 fetch（undici）固定只等 5 分鐘回應標頭，
mlx-audio 第一次收到請求才下載、載入幾 GB 的模型，超過 5 分鐘 client 就放棄，
只丟一句 "fetch failed"——server 後來其實回了 200。改用 node:http，`timeoutMs`
可調，逾時訊息直接講是模型還在載入。

---

## 2026-09-28　screencast：假游標預設放大 1.5 倍、可設定

24px 的游標在 1080p 錄影裡太小（使用者提出）。加 `scenario.cursor`
（`scale`／`size`／`rippleSize`／`rippleColor`），預設 `scale: 1.5`。

順手修正定位：以前是 `translate(x-2, y-2)`，但箭頭尖端在 SVG 的 (4,2)，
所以尖端其實偏右 2px；放大後誤差會跟著放大。改成依比例把**尖端**對準座標。

**代價**：所有新錄的影片游標都變大，跟以前錄的放在一起看會不一致。
要維持舊樣子設 `cursor: { scale: 1 }`。

---

## 2026-09-28　screencast：鏡頭推近／平移（zoom、pan）

### 錄完後依 manifest 用 ffmpeg 做，不在錄影當下改頁面

考慮過錄影時用 CSS transform 放大網頁（最清楚），但會干擾頁面排版、fixed 元素與
點擊座標，容易把受測系統弄壞。改成錄影照舊，manifest 多記每步的元素外框與按下去
的時間（`focus`、`actionMs`），錄完算鏡頭路徑、另外輸出 `demo-zoomed.mp4`。
好處是調 zoom 不用重錄（`--zoom-only`）。也考慮過 HyperFrames，對大量操作教學太重。

### 開關：預設關，`autoZoom` 全開，step 的 `zoom` 個別覆寫（使用者選的方案 3）

### 有 zoom 就用 2 倍像素錄影，而且要加 `--force-device-scale-factor`

實測 Playwright 的 recordVideo 會**忽略** `deviceScaleFactor`：畫面照 CSS px 大小錄，
其餘填灰色；CDP `Page.startScreencast` 在 headless 下也只給 CSS px 大小（而且只有
約 8 fps）。加上 Chrome 的 `--force-device-scale-factor=2` 才錄得到真的 2 倍細節
（裁同一塊區域逐像素比對確認）。頁面看到的 innerWidth 不變，排版與座標不受影響。

**代價**：1080p viewport 等於錄 4K，錄影時 CPU 吃重（實測 M4 Pro 一支 34 秒的影片
整個流程 60 秒）；`demo.webm` 檔案變大。沒開 zoom 時維持 1 倍，不受影響。

### 運鏡用 ffmpeg `perspective`，不用 `zoompan`／`crop`

zoompan 與 crop 只能以整數像素移動，平移時畫面會一格一格地抖。perspective 用小數
座標取樣（cubic），能做平滑的推移。

運算式寫成「每段乘 0/1 開關再加總」的平的形式：一開始用巢狀 `if()`，測試抓到
ffmpeg 運算式解析器有巢狀深度上限，150 個關鍵格就解析失敗。

### 鏡頭規則

- 鏡頭在點下去那一刻到位（轉場 700ms，smoothstep），跟游標一起動。
- goto 拉回全畫面；wait／waitFor 維持鏡頭（送出後等結果，鏡頭停在那裡）。
- 下一個焦點還在目前鏡頭中央 70% 內、倍率相同就不動，避免小幅晃動。
- 元素放不進鏡頭 90% 就降低倍率，低於 1.15 倍就不推近。
- 最後一步做完就拉回全畫面，用最後一步的結束時間，不用 totalMs（它包含錄完後的
  截圖、關瀏覽器時間，實測比影片長，會讓拉遠落在影片結束之後）。

### `final.png` 改成只截 viewport

`fullPage: true` 會暫時撐大 viewport，這段被錄進影片結尾；2 倍像素錄影時是畫面縮到
左上角、旁邊一片灰。改成只截目前畫面，也就是觀眾在影片最後看到的樣子。

**代價**：長頁面的 final.png 不再是整頁。

---

## 2026-09-29　screencast：發佈給團隊（一半 Windows、一半 Mac）

### 維持 git clone ＋ 連結，不做成 plugin

做成 plugin 可以 `/plugin install`，但 screencast 需要 node_modules 與 Chromium；plugin
每次更新都換一個快取路徑，這些得重裝，SKILL.md 裡寫死的 `~/.claude/skills/screencast/run.mjs`
也要改。clone 下來再用連結接上最單純，更新就是 `git pull`。

Windows 用 junction（`New-Item -ItemType Junction`）取代 `ln -s`：不需要系統管理員，
也不用開開發人員模式。

**代價**：安裝步驟比 `/plugin install` 多；Mac 與 Windows 要寫兩套。用 doctor 補。

### 加 `npm run doctor`

同事的環境各不相同，最常見的是漏裝一樣東西、錄到一半才失敗。doctor 檢查 Node、
Chromium（用錄 zoom 的同一組參數開一次）、ffmpeg 與 libx264／libopus／aac 編碼器、
perspective 濾鏡、edge-tts 實際連到微軟合成一次、skill 連結；缺什麼就印出那個平台的指令。
預設會真的打一次 edge-tts，因為公司防火牆擋住是實際可能發生的事；`--offline` 可跳過。

### Windows 路徑：`fileURLToPath`，引擎再補一層

`new URL(..., import.meta.url).pathname` 在 Windows 上是 `/C:/...`，而範例 scenario 的
outDir 就是這樣寫的——同事照範例複製就會失敗。範例、kokoro 的 venv 路徑、測試全改成
`fileURLToPath`；引擎另外把 Windows 上 `/C:/` 開頭的 outDir 修正回來，讓以前照舊範例
寫的 scenario 也能跑。

### kokoro 在 Windows 上不支援

它透過 `npx hyperframes tts` 呼叫；Node 在 Windows 上不開 shell 就不能執行 `npx.cmd`，
開 shell 又要處理中文講稿的跳脫。kokoro 本來就排在最後、中文不建議用，直接標明不支援。

## 2026-10-07　clean-view：簡潔檢視 mod

### 介面全部用繁體中文（使用者指定）

原規格是英文。步驟名稱上限從「40 字元」改成「40 個顯示格」，約等於 20 個中文字，
欄寬用顯示寬度計算（中日韓文字佔 2 格），窄視窗才不會換行。回給 Claude 的工具結果
（`Planned N steps…`、`Progress noted: N%.`）維持規格的英文，因為只有模型會讀到。

### 開發版放在 session 的 dev-mods 資料夾，repo 裡放一份可安裝的副本

hot reload 只監看 `~/.claude/dev-mods/<session>/`，所以開發在那裡進行。`clean-view/`
是複製到 repo 的副本，並在根目錄的 `marketplace.json` 加上一筆，讓別台電腦可以用
`/plugin install clean-view --marketplace johnshaw77/ai-toolkit` 安裝。
**代價**：之後修改要記得同步兩邊。

### 計畫閘門出錯時放行，不擋

`claude plugin validate` 會列出 tool.call 是「沒有 .catch 的 gating hook」。這是故意的：
hook 出錯時引擎會跳過它，等於放行。這是給非技術使用者用的 UX mod，hook 壞掉時
寧可少一道閘門，也不要讓 Claude 什麼工具都不能用。

### 「Claude 在等你回覆」之後你回覆了：沿用同一份工作

規格寫「沒有工作在跑時送出的提示就開始新工作」。但在「需要你：Claude 在等你回覆」
的狀態下，你的回覆其實是同一件事的延續，所以沿用原本的清單。其他狀態（完成、停止、
卡住）都會開始新工作。

### 你拒絕權限時保持「卡住」

拒絕權限通常會讓這一輪以中斷結束。若照一般規則會變成「已停止 · 你按了 Esc」，
但實際上你並沒有按 Esc。所以這一輪只要有權限被拒絕，結束時就維持「卡住了：
你拒絕了一個步驟，所以 Claude 先暫停了」。

### API 錯誤的原因：StopFailure 和 turn.complete 兩邊都處理

`turn.complete` 只告訴我們 `reason: 'error'`，錯誤種類要從 `classic.StopFailure` 的
`error` 和 `error_details` 才看得到。兩者到達的先後不一定，所以兩邊都會寫入：
先到的先顯示，後到的再補上更準確的原因。

### 測試從畫面檢查，不直接讀 state

測試用的 `$` 沒有 `state` 和 `store`。所以每個行為都 mount 輸入框上方的清單，
再找畫出來的文字，這樣也順便驗證了畫面本身。

## 2026-10-07　clean-view 0.2.0：Agent Dock

### 跟 Clean View 放在同一個外掛

照需求放在同一個外掛，不另開新外掛。Dock 用的是 Clean View 註冊的 `report_progress`，
helper 的回報用 `{ tool, agentId: /./ }` 這個 matcher 接住；Dock 先註冊，所以會比
Clean View 的同名工具 hook 先拿到。同一個外掛裡，同一個事件加同一個 matcher 只能有一個
hook，所以 Dock 的 `session.start`、`turn.complete` 都改用萬用 matcher
（`{ cwd: /^/ }`、`{ reason: /^/ }`）。

### 介面用繁體中文（使用者後來改的）

規格原本是英文。字標「A G E N T   D O C K」保留英文，因為這是產品名稱；
其他文字都改成中文，例如「● 進 行 中／完 成／待 命」、「N 位助手完成「…」，花了 …」。
給模型看的文字維持英文：拆工指示、上限訊息、補送提醒。

### 徽章只用英文字母，畫法改成 inverse

第一版用「深色字＋指定 hex 底色」，中文名稱取第一個字。實測時使用者看不到字，
推測是底色沒畫出來，深色字貼在深色背景上。所以改成兩點：
- 一律用名稱裡的英文字取兩個字母（`GC`、`PA`），沒有英文就用編號（`01`）。
- 改用 `inverse`，由終端機自己對調字色和底色，不依賴 hex 底色有沒有畫出來。

選中的人數 chip 也一起改。

### helper 是背景執行，完成時間看它自己那一輪的 turn.complete

在這個 build，Agent 工具會馬上回 `async_launched` 和 `agentId`，helper 在背景跑。
所以卡片是這樣變化的：
- `tool.call` 放行時，卡片變成「工作中」。
- 結果帶回 `agentId` 後，跟這張卡片綁在一起。
- 那個 helper 的 `turn.complete`（帶 `agentId`）到了，卡片才變成完成或卡住。

如果是同步完成（`status: 'completed'`），`tool.call` 一回來就直接標成完成。
整份工作要「全部卡片都結束，而且主對話這一輪也結束、沒有等著補送的提醒」才算完成。

### 排隊卡片在 tool.call 放行時也會補畫

Claude 一寫出 Agent 呼叫，`session.append`（door 是 `response`）就會先畫出排隊卡片。
但測試工具沒辦法替 `session.append` 回應，所以另外在 `tool.call` 放行時也補一張排隊卡片，
兩條路徑都能畫出來。

### 入口：輸入框上方那列的 ◆ Dock 按鈕

使用者沒有 Tools 選單，而狀態列在這個 API 只能放文字、不能放按鈕。所以入口放在
Clean View 那一列，跟開關按鈕並排。按下按鈕和輸入 `/dock` 都算「使用者自己打開的」，
窄視窗也放得下。

### 待命時的座位不閃爍

需求有兩點衝突：「待命時座位輕輕閃爍」和「待命時不跑計時器」。依照引擎規則，
待命時不跑計時器，座位用固定的深淺交錯呈現。

### 安裝方式：~/.claude/mods/clean-view＋CLAUDE_CODE_PLUGIN_DIRS

這台電腦沒有用 `/plugin install` 裝過 clean-view，其他 mod 都是放在 `~/.claude/mods/`、
再透過 `CLAUDE_CODE_PLUGIN_DIRS` 載入。所以同步後把 `~/.claude/mods/clean-view` 加進
那個環境變數，也在 `~/.claude/mods/README.md` 補上一列。

另外在 `env` 加上 `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=20`、
`CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY=20`，讓每一波是 20 位。

**代價**：現在有三份要同步：dev-mods 開發版、repo、`~/.claude/mods`。

### 型別檢查用不含 MCP 清單的 tsconfig

外掛載入後，引擎會在 `.claude-plugin/types/claude-code-mcp/` 列出所有接上的 MCP 工具，
這台電腦有 458 個。這麼大的 union 讓 tsc 在 `tool.call` 的 matcher 上推導過深，
`e` 被推成 `never`。拿掉這份清單（只用 API 宣告）就是 0 個錯誤，所以問題在環境，
不是程式碼。

### 已知限制：上一批 helper 還在跑時送出新請求，會開一份新工作

`prompt.submit` 在主對話閒置時收到新請求，會開新的 Dock 工作。這時舊工作還在跑的
helper，完成時就對不到卡片了，舊工作的總結也看不到。

而且人數設為 N 時，連「同步檔案」這種不適合拆的請求也會帶上拆工指示，結束時還會
補送「你只用了 0 位」的提醒。做這類工作前，先 `/dock 1`。

## 2026-10-07　clean-view 搬到 repo 的 `mods/`

使用者指定：mod 的原始碼放在 repo 的 `mods/` 底下，全域安裝的副本另外處理。所以用
`git mv clean-view mods/clean-view` 搬移，`marketplace.json` 的 `source` 改成
`./mods/clean-view`，`~/.claude/mods/README.md` 裡的原始碼路徑也一起改。
全域副本 `~/.claude/mods/clean-view` 和 `CLAUDE_CODE_PLUGIN_DIRS` 都不動。
之後新做的 mod 也放在 `mods/<名稱>/`。

## 2026-10-07　Agent Dock：一位都沒派就不提醒；`/dock 3 問題` 一行完成

### 0 位不補送提醒（使用者決定）

原規格是「用了少於 N 位就補送一次提醒」。實際用下來，問答、commit、搬檔這類不能拆的
請求，結束後每次都會收到「你只用了 0 位」。所以改成派了至少 1 位、但不到 N 位才提醒；
一位都沒派，就當成這個請求本來就不適合拆。

### `/dock 3 問題內容`

這個指令會設好人數，開好 Dock 工作，再把問題送出。外掛送出的 prompt 有兩個限制：
- 不會經過外掛自己的 `prompt.submit` hook。
- `$.prompt.submit` 不能帶 `context`。

所以拆工指示改用 `$.session.append` 先插一列只有模型看得到的 user 列，再用
`asUser: true` 把問題當成使用者的話送出。超過 20 人時只設定待確認，不送出問題，
要在面板確認後再送一次。

測試環境沒有主對話，那一列指示接不到，所以測試只驗證「問題有送出、面板開了人數 3 的
工作」，指示有沒有送到要靠實測確認。

## 2026-10-07　ccdash：修 6 個問題（使用者同意「照你說的做」）

### hook 交給背景子行程送出

原本 hook 在每次工具呼叫前後都會同步 POST。collector 連不到時（例如經 Tailscale 連到睡著的機器），每次要等到逾時：HTTP 1.5 秒，加上 tmux 查詢最多 1 秒。

現在改成 hook 只負責解析事件，然後用 `Popen` 啟動 `ccdash.py _post`，把紀錄從 stdin 交給它，不等它結束。POSIX 上用 `start_new_session`，Windows 上用 `DETACHED_PROCESS`。查 tmux pane 也移到子行程裡做。

**代價**：每個事件多開一個 Python 行程（背景跑，不佔 Claude 的時間）。另外，Windows 上背景子行程能不能正常脫離，還沒實測。

### collector 蓋時間，GET 附上 `now`

各台機器的時鐘不一定一致，所以 `ts` 改由 collector 收到事件時蓋章。GET 的回傳從 list 改成 `{"now", "sessions"}`，TUI 用 collector 的時間計算。舊格式的 list 照樣讀得懂。

### 預設只綁 127.0.0.1；沒設密碼又不是綁本機就拒絕啟動

原本預設 `0.0.0.0`、token 又是選填，等於區網裡誰都能讀寫。這件事本來是待辦第 4 項，現在直接修掉。部署時改用 `--bind $(tailscale ip -4)`。

### 遮蔽金鑰：Bearer 要最先處理

第一次實測發現，`Authorization: Bearer abc.def` 會被「名稱像金鑰的變數」那條規則先吃掉，它把「Bearer」當成值換掉，真正的 token 反而留下來，也寫進了狀態檔。調整規則順序後，8 種寫法都不會再洩漏。

### 順手修好 ccdash/CLAUDE.md 的格式

被跳脫的程式碼區塊、被自動轉成錯誤連結的 `ccdash.py` 和 `README.md`、網址多出來的反引號，都一起改回來了。這些地方本來就要配合這次修改重寫。
