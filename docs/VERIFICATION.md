# 驗證紀錄

追加式。每輪實際看到什麼，不是「應該可以」。

---

## 2026-09-17　搬家後的完整驗證

環境：macOS 25.5.0、git 2.49.0、node（Playwright 1.63）、Python 3.12 / uv、jq 1.7.1-apple。

### git 歷史（subtree）

```
$ git log --oneline | wc -l
57
$ git log --oneline | tail -3
0379c06 Bump to 0.2.0
d8eb2a8 Fill out the git rules the injected context was missing
578a1b1 Add solo-workflow plugin        ← unattended 最早的 commit，有帶到
$ git log -1 --format='%P' 680dc79
7706c5a…（ai-toolkit 初始）d3c99a2…（unattended 原 HEAD）  ← 兩個 parent，非 squash
$ git cat-file -t f05b995
commit                                  ← 舊物件都在
```

`git log -- <子目錄>` 只顯示 merge commit（git 的歷史簡化），要查舊歷史得用
`git log --full-history -- <子目錄>` 或直接 `git log`。

### smart-scaffold 的 web preset 有搬到

```
$ find smart-scaffold/src/smart_scaffold/templates/web -type f | wc -l
39
```

### install-bin.sh 的新偵測（用假的 HOME / CLAUDE_CONFIG_DIR，不動真的家目錄）

| 情境 | 結果 |
|---|---|
| 新佈局：plugin 在 `<marketplace>/unattended-workflow` | ✓ 找到，symlink 建對，`unattended --help` 跑得起來，rc=0 |
| 舊佈局：plugin 就是 marketplace 根（相容性） | ✓ 仍找到，rc=0 |
| 沒有 jq（走 fallback） | ✓ 找到 ai-toolkit 路徑 |

清單裡放了一個不存在的 marketplace 當干擾項，確認迴圈會跳過繼續找。

### 三支 hook

`export CLAUDE_PLUGIN_ROOT="$PWD"`，stdin 餵 JSON，stdout 存檔後 `jq -e .`：

| hook | 結果 |
|---|---|
| `session-start.sh`（一般） | ✓ 合法 JSON，`hookEventName: SessionStart`，注入 123 行準則 |
| `session-start.sh`（`.claude/UNATTENDED` 存在） | ✓ 合法 JSON，145 行，含「無人值守」段落，且讀到標記檔第一行的任務備註 |
| `session-start.sh`（`source: compact`） | ✓ 合法 JSON，含壓縮後的重讀提醒 |
| `verify-gate.sh`（真的 .jsonl） | ✓ stdout 為空＝放行 |
| `archive-transcript.sh --session` | ✓ stdout 為空＝no-op（測試專案沒有 docs/transcripts/） |

⚠️ 測試時的坑：**zsh 的 `echo` 會把 JSON 字串裡的 `\n` 解釋成真換行**，
`out=$(...); echo "$out" | jq .` 會假性報 parse error。要把 stdout 直接重導到檔案再驗。

### smart-scaffold

```
$ uv run --extra dev pytest -q
114 passed in 7.37s
$ uv tool install --editable '…/ai-toolkit/smart-scaffold' --force
+ smart-scaffold==0.1.0 (from file:///…/ai-toolkit/smart-scaffold)
$ smart-scaffold --help
    app  全端專案：FastAPI + SQLAlchemy 2.0 + Vue3 + Ant Design Vue
    py   Python 專案：uv + src/ 套件分層 + scripts/ + config/
    web  網頁工具：FastAPI + Jinja2 + 原生 JS + sqlite，零 Node   ← 新搬到的 preset
```

uv-receipt.toml 的 `editable` 已指向 ai-toolkit。

### screencast

symlink 接上後 `screencast` 立刻出現在 Claude Code 的 skill 清單裡。
`npm install`（2 packages）＋ `npx playwright install chromium`（94.3 MiB，
Chrome Headless Shell 153.0.8010.12）。

實錄一支（example.com，goto / wait / click 三種 step，無旁白）：

```
1/4) 打開首頁　2/4) 等待載入　3/4) 點「Learn more」連結　4/4) 停留看結果
完成，全部步驟成功
```

產出 `demo.webm` 337 KB、`final.png` 119 KB、`manifest.json`（四步的 tStart/tEnd 都在）。
截圖確認**假游標 overlay 有渲染**，且 click 真的導航到 iana.org。

第一次跑時第 3 步失敗，原因是 example.com 改版把連結文字從 `More information...`
改成 `Learn more`——**與搬家無關**，`examples/example-scenario.mjs` 本來就是虛構範例。

### 既有專案的 scenario 沒被搬壞（端到端）

拿一個公司內部 web app 既有的 9 步 scenario（登入 → 開清單 → 展開詳情）實跑，
確認引擎換位置後，「引擎裝在 skill 目錄、scenario 留在各專案」這條路仍然成立。

把 narration 拿掉（本機沒有 `OPENAI_API_KEY`）跑完整 9 步：

```
1/9) 打開登入頁 … 9/9) 停留讓畫面看清楚
完成，全部步驟成功
```

`demo.webm` 2.8 MB。`final.png` 確認真的登入、詳情展開、假游標停在正確的連結上。

**未驗**：旁白合成與字幕產出（需要 `OPENAI_API_KEY`），以及 `demo-narrated.webm` / `.srt` / `.vtt`。

### 真實環境切換（不是模擬）

```
$ claude plugin marketplace add johnshaw77/ai-toolkit
✔ Successfully added marketplace: ai-toolkit
$ claude plugin install unattended@ai-toolkit
✔ Successfully installed plugin: unattended@ai-toolkit (scope: user)
$ claude plugin uninstall unattended@claude-unattended-workflow
$ claude plugin marketplace remove claude-unattended-workflow
✔ Successfully removed marketplace

$ claude plugin list
  ❯ unattended@ai-toolkit
    Version: 0.23.0
    Status: ✔ enabled          ← 舊的兩份都清掉了，沒有並存
```

接著用**真的** `known_marketplaces.json`（假的 `HOME`，symlink 導到暫存目錄，
不動自己的 PATH）跑 install-bin：

```
✓ 來源：~/.claude/plugins/marketplaces/ai-toolkit/unattended-workflow/bin/unattended
✓ 試跑 unattended --help 成功
rc=0
```

`installLocation` 是 `…/marketplaces/ai-toolkit`，plugin 根在它下一層。
**沒改 install-bin.sh 的話這一步會失敗**——舊的偵測只看 `$loc/bin/unattended`。

### 公開前的機密掃描

`grep -rniE "api[_-]key|secret|password|token|BEGIN.*PRIVATE KEY"` 逐條看過，
命中的全是變數名、文件裡的說明、模板佔位符（`{{var}}`、`dev-only-change-me…`、
`admin1234`），沒有真值。git 歷史沒有 `.env` / `.pem` / 憑證類檔案。

**掃出一個真的問題並修掉**：這份 VERIFICATION.md 初稿寫了公司內部網址與一筆
真實會議標題。公開 repo 不能有那些，已改寫成泛稱。

---

## 2026-09-28　unattended 0.24.0（守衛 hook、pytest 探測）

環境：macOS 25.5.0、`/bin/bash` 3.2.57（macOS 內建版本，刻意用它測）、jq、uv。
全部用手動餵 JSON 的方式跑 hook，**沒有**經過 `claude plugin update` 在真實 session 裡觸發。

### guard.sh（21 個案例）

互動模式（無 `.claude/UNATTENDED`）：

```
git push / git push -u origin feat/x / cd x && git -C . push --force
FOO=1 git push / /usr/bin/git push                        → ask
docker compose down -v / compose -f a.yml down --volumes
docker-compose down -v                                    → ask
git commit -m "修正 push 通知" / git log --grep push
echo "git push" / docker compose down / up -d --build
git commit（在 main）/ npm test                            → 不輸出
```

無人值守（有標記檔，git repo 在 `main`）：

```
git push                         → deny
git add -A && git commit -m x    → deny（在 main）
docker compose down -v           → deny
git status                       → 不輸出
切到 feat/x 後 git commit        → 不輸出
```

非 Bash 工具（`Edit`）→ 不輸出、exit 0。所有輸出都能被 `jq` 解析（stdout 只有一包 JSON）。

### verify-gate.sh 的 pytest 探測

用假 transcript（一筆 `Edit` 改 `pkg/core.py`），PATH 限縮成 `/usr/bin:/bin:/opt/homebrew/bin`
（確保 PATH 上沒有 pytest）：

| # | 情境 | 結果 |
|---:|---|---|
| 1 | 有 `tests/`、沒有任何 pytest | block：「有測試檔，但找不到可以執行的 pytest」 |
| 2 | `.venv` 裡有 pytest、測試失敗 | block：「`.venv/bin/pytest` 沒有通過」 |
| 3 | `.venv` 裡有 pytest、測試通過 | 放行 |
| 4 | 有 `pyproject.toml`、沒有測試檔 | 放行（維持舊行為） |

改 `.vue` 沒開瀏覽器 → block，訊息結尾有新增的「沒裝瀏覽器 MCP 時怎麼辦」段落。

`bash -n` 四支 hook 語法通過、`hooks.json` 是合法 JSON。

**沒驗到的**：`uv run pytest` 那條路徑（要連網裝依賴）、Windows、以及 `ask` 在
`bypassPermissions` 模式下是否仍會跳出確認——要裝新版後在真實 session 裡試。

---

## 2026-09-28　unattended 0.24.0 實機補驗：守衛在 bypass 模式仍會跳確認

裝上 0.24.0、重開 Claude Code（bypassPermissions 模式），在沒有 remote 的測試 repo
叫 Claude 執行 `git push`：權限確認框出現，使用者選 No，工具呼叫被拒絕。
上一條紀錄「沒驗到：`ask` 在 bypass 模式下是否仍會跳出確認」→ **會**。

## 2026-09-28　unattended 0.25.0（互動模式不跑測試、agent 跑過就不重跑）

環境：macOS、`bash` 3.2.57、jq、uv。用假 transcript（帶 `timestamp` 與 `tool_use_id`，
格式照真實 transcript），專案的 `.venv` 裡裝了 pytest、測試**刻意會失敗**：

| # | 情境 | 結果 |
|---:|---|---|
| 1 | 互動｜改 `.py` | 放行（不跑測試） |
| 2 | 互動｜改 `.vue`、沒開瀏覽器 | 擋下（UI 檢查照舊） |
| 3 | 無人值守｜agent 沒跑測試 | 擋下：`.venv/bin/pytest` 沒通過 |
| 4 | 無人值守｜改檔後跑過 `pytest -q`、沒有 `is_error` | 放行（信任 agent 的結果） |
| 5 | 無人值守｜跑過但是 `pytest -q 2>&1 \| tail -5` | 擋下（有 pipe 不算） |
| 6 | 無人值守｜跑過但 `is_error: true` | 擋下 |
| 7 | 無人值守｜pytest 在改檔**之前** | 擋下 |

效能：在最大的一份真實 transcript（76.8 MB）上建事件表，解析出 789 個工具呼叫、
25 個失敗結果，耗時 0.04 秒。

**沒驗到的**：npm／go／cargo 的 `already_ran` 樣式（只驗了 pytest）；
真實 session 裡的無人值守跑一輪。


## 2026-09-28　screencast：測試網與第一輪優化

環境：macOS、Node 22.21.0、Playwright 1.63（Chromium headless）、Homebrew ffmpeg
（有 libx264／libopus／aac）。

`npm test`（`node --test 'test/*.test.mjs'`）：**44 個測試全過**，完整跑 4 次都是全綠
（加 CLI 測試前是 43 個，連跑 4 次）。

| # | 檔案 | 測試數 | 涵蓋 |
|---:|---|---:|---|
| 1 | `subtitles.test.mjs` | 8 | 時間戳格式、起點用 `narrationStartMs`、切句與比例分配、舊 manifest 回推 |
| 2 | `locate.test.mjs` | 7 | regex 跳脫、定位優先順序、fill 不拿 text 定位、`value`／`text` 相容 |
| 3 | `narration.test.mjs` | 12 | 假 TTS、Authorization 規則、HTTP 錯誤、連線失敗訊息、mp3 副檔名、快取命中／不命中／損毀 |
| 4 | `out-dir.test.mjs` | 5 | 標記檔、舊版 manifest、拒絕刪除不相干資料夾 |
| 5 | `manifest-to-srt.test.mjs` | 2 | 舊錄影補字幕（用 ffprobe 量 wav 回推） |
| 6 | `cursor.test.mjs` | 3 | 游標掛在 `<html>`、跟著移動、換頁後留在原位、漣漪 |
| 7 | `e2e.test.mjs` | 7 | 完整錄一支、dry-run、快取重錄、失敗中止、`abortOnError:false`、outDir 防呆、CLI exit code |

**確認測試抓得到舊 bug**：

- 把 `lib/cursor-overlay.mjs` 換回 HEAD 版本跑 `cursor.test.mjs`：「換頁後游標留在原位」
  失敗，actual `translate(-4000px, -4000px)`（游標在畫面外）。換回新版通過。
- fixture 輪詢頁用舊的 `waitUntil: 'networkidle'`（逾時 8 秒）：`page.goto` 逾時。
  新版同一頁的 goto 步驟 2.7 秒完成。
- 游標測試單獨跑 6 次全過，但跟 e2e 平行跑時失敗 1 次（游標元素是 null），
  追到 rAF 初始化時序的問題，修掉後完整 suite 連跑 4 次全過。

**e2e 產物實際檢查**（ffprobe＋抽影格目視）：

- `demo.webm` 只有 vp8；`demo-narrated.webm` 是 vp8＋opus；`demo.mp4` 是 h264＋aac，
  長度與 narrated 相差 < 0.5 秒；webm 長度與 manifest `totalMs` 相差 < 2 秒。
- 抽 6 張影格：假游標在每張都看得到；姓名、email 有逐字打出；點「下一頁」換到
  第二頁後，游標停在點擊位置（修正前這張會沒有游標）。
- 字幕：第一張字卡 `00:00:02,738` = 第一句 `narrationStartMs` 2738；長句被切成 3 張、
  首尾相接。

**向下相容**：`jnxstudio-tour` 原本的 8 個 steps（真實網站 jnxstudio.com），用
`--dry-run` 跑：8 步全部對得到、exit 0、13 秒。

**沒驗到的**：kokoro engine 與真正的 OpenAI API（沒有打真的 TTS）；
真的內部系統（Vue、有登入）還沒錄過；Windows。

## 2026-09-28　screencast：本地／免費中文 TTS 比較，edge 接進引擎

環境：M4 Pro、48 GB、macOS 26.5.2；mlx-audio 0.5.6（mlx 0.32.2）、edge-tts（`uv tool install`）。

**試聽比較**（同三句繁體講稿，透過 screencast 自己的 `synthesizeNarration` 合成）：

| # | 設定 | 合成 | 音長 | RTF |
|---:|---|---:|---:|---:|
| 1 | kokoro `zf_xiaobei` | 15.0s | 22.7s | 0.66 |
| 2 | Qwen3-TTS 0.6B 8bit `Vivian` | 9.4s | 22.6s | 0.41 |
| 3 | Qwen3-TTS 1.7B bf16 `Vivian` | 25.0s | 20.2s | 1.23 |
| 4 | Breeze-TTS-2 男聲（instruct） | 91.6s | 14.7s | 6.22 |

使用者另外用一段中英夾雜的稿子聽了 edge 的曉臻／曉雨／雲哲（每句 2–3 秒）與
Breeze 女聲（90 秒），選定順序 edge 曉臻 > Breeze > Qwen3。

**抓到的 bug**：Qwen3 1.7B 與 Breeze 第一次合成都失敗、只回 "fetch failed"；
mlx-audio 的 log 顯示 server 在 client 放棄之後回了 200。原因是 fetch 的 5 分鐘上限，
改用 node:http 後重跑，兩者都成功。

**自動測試**：`npm test` 56 個全過。新增 `edge.test.mjs` 9 個（用假的 edge-tts
執行檔，不連網：預設 engine／音色、mp3 副檔名、speed→rate、開頭是「-」的講稿、
快取、找不到執行檔、stderr 帶出、沒產出檔案）；`narration.test.mjs` 新增 3 個
（慢回應在 timeoutMs 內成功、逾時訊息、timeoutMs 不影響快取 key）。

**真實 edge-tts 端對端**：scenario 不寫 `narration.engine`，對本地 fixture 錄 5 步、
5 句旁白：全部成功、39 秒；`narration/step-N.mp3`；`demo.mp4` 是 h264＋aac，
`volumedetect` mean −20.9 dB（真的有聲音）；字幕第一張 `00:00:02,741`。
同一支重跑：「其中 5 句來自快取」。輸出留在 `examples/out/edge-demo/`（不進版控）。

**沒驗到的**：Windows 上的 `uv tool install edge-tts` 與整條流程（沒有 Windows 機器）；
Qwen3-ASR 客觀轉寫比對（模型下載佔網路，中途停掉）。

## 2026-09-28　screencast：游標大小可設定

`npm test` 60 個全過。`cursor.test.mjs` 改成量**箭頭尖端的實際螢幕位置**
（path 的 getBoundingClientRect），不再比對 transform 字串：預設 36px、
`scale: 1`／`2.5`／`size: 50` 尖端都在滑鼠座標 ±1px 內；換頁後仍在原位；
漣漪 `scale: 2` 時直徑 80px、圓心在點擊位置、顏色照設定。
另加 e2e：`cursor.scale: 0` 在刪 outDir 前就報錯，上一支影片沒被刪。

實際錄影：用真的 edge-tts 重錄 fixture 示範（5 句旁白全部來自快取），
抽點擊「儲存」前後三格放大檢視：游標明顯比原本大，漣漪圓心落在箭頭尖端。

## 2026-09-28　screencast：鏡頭推近／平移

**可行性實測**（寫程式前）：

| # | 方法 | 錄出來 | 結論 |
|---:|---|---|---|
| 1 | Playwright `deviceScaleFactor: 2` ＋ recordVideo 2 倍大小 | 1280×800 的畫面貼在 2560×1600 左上角，其餘灰色 | 不行 |
| 2 | CDP `Page.startScreencast`（DSF 2、maxWidth 2560） | 1280×800，約 7.8 fps | 不行 |
| 3 | `--force-device-scale-factor=2` ＋ DSF 2 ＋ recordVideo 2 倍 | 2560×1600，裁同一塊逐像素比對比 1 倍放大銳利 | 採用 |

ffmpeg perspective 原型：2 秒 2560×1600 影片推近＋平移，0.7 秒渲染完，抽格位置正確。

**自動測試**：`npm test` 80 個全過。

- `camera.test.mjs`（14）：resolveZoom 組合、focusRect 置中／靠邊夾住／元素太大降倍率、
  planCamera 各規則、擠在一起的 40 步關鍵格時間仍遞增且不出界；
  **實際渲染**：四象限不同顏色的合成影片，推近左上象限時四個角都是紅、平移到右下時
  四個角都是藍；150 個關鍵格的運算式能渲染（巢狀 if 版本在這裡失敗，改成加總形式後通過）。
- `zoom.test.mjs`（6）：autoZoom 錄影是 2000×1400、demo.mp4／demo-zoomed.mp4 縮回
  1000×700、h264＋aac、長度與帶旁白版相差 < 0.5 秒；manifest 有 focus／actionMs／zoom
  與 camera；`--zoom-only` 不動 demo.webm、不打 TTS、倍率 3 生效；都不放大時移除運鏡版；
  步驟數或 type 對不上拒絕；沒錄過／dry-run 輸出給明確錯誤；zoom < 1 開瀏覽器前報錯。

**實際錄影**（1920×1080 viewport、autoZoom、真的 edge-tts 曉臻）：錄影 3840×2160、
三支影片都是 843 格／33.7 秒，整個流程 60 秒。抽 6 格：全畫面 → 推近姓名欄（字清楚、
漣漪在按下時出現）→ Email 輸入中 → 點儲存 → 「已儲存」訊息出現時鏡頭仍推近 → 結尾。

**過程中抓到並修掉的**：
- 結尾拉遠的關鍵格在 36.0 秒，但影片只有 33.7 秒（totalMs 含錄完後的處理時間）。
  改用最後一步結束時間後，拉遠在 32.4 秒完成。
- 影片結尾出現「畫面縮到左上角、旁邊一片灰」：是 fullPage 截圖撐大 viewport 被錄進去。
  改截 viewport 後重錄，結尾 4 格都正常。
- `--zoom-only` 在真實影片上重新輸出運鏡版 21 秒。

**沒驗到的**：Windows 上的 `--force-device-scale-factor`；非常長的影片（10 分鐘以上）
的渲染時間。

## 2026-09-29　screencast：doctor 與跨平台

`npm test` 81 個全過（新增 `normalizeOutDir`：Windows 上 `/C:/Users/me/out/demo` →
`C:\Users\me\out\demo`，其他平台不動）。

`npm run doctor`（這台 Mac）：9 項 ✓、1 項選用資訊，exit 0。

模擬缺裝（PATH 只留 Node、HOME 指向空資料夾）：Chromium、ffmpeg、ffprobe、edge-tts、
skill 連結 5 項 ✗，各自印出 brew／npx／uv／ln -s 的指令，並提示 uv 也沒裝；exit 1。

模擬公司網路擋住微軟（假的 edge-tts 回 `Cannot connect to host speech.platform.bing.com:443`）：
「edge-tts 合成失敗」並提示檢查防火牆與 `uv tool upgrade edge-tts`。

公開 repo 檢查：要 commit 的 25 個檔案掃過 api key／secret／password／私鑰／email，
只有已公開的 GitHub 帳號名稱。

**沒驗到的**：Windows 實機（沒有 Windows 電腦）。Windows 的步驟與 doctor 的 Windows 提示
是照文件寫的，要等同事實際裝一次、回報 `npm run doctor` 的輸出。

## 2026-10-07　clean-view：簡潔檢視 mod

`claude plugin validate`：manifest、hooks、types 全部通過。hooks 涵蓋 15 個掛點，
state 讀寫都在 `clean-view` 底下的 3 個 key。repo 根的 `marketplace.json` 也通過。

型別檢查（TypeScript 5.6，用 skill 附的 tsconfig）：0 個錯誤。

`claude plugin test`：13 個全過，終端機與桌面兩種畫面都有驗到。

| # | 測試 | 看到的結果 |
|---:|---|---|
| 1 | 名稱清理 | `` Build the pricing section in `src/Pricing.tsx` `` → `Build the pricing section in`；句中路徑消失；80 字元 → `Write a friendly welcome message for…`（37 格）；中文長名稱 ≤ 40 格 |
| 2 | 待辦清單 + 60% | ✓／▶ `██████░░░░` 60%／下一步／稍後，terminal、desktop 都有 |
| 3 | 窄視窗 | 30 欄時名稱欄剛好 10 格 |
| 4 | 權限提示 | 「需要你」＋「Claude 需要你同意才能繼續」＋ ‖；下一個工具跑完就回到 ▶ |
| 5 | `/simple off` | 清單收起，只剩 `○ 簡潔檢視：關`；ToolUse 列重新出現；按鈕切回開並跳出 toast |
| 6 | 重開後記得設定 | store 存 false → session.start 後按鈕顯示「關」 |
| 7 | plan_steps → 回報 100 | 第一步 ✓、第二步 ▶ 進行中、第三步 下一步；140% 夾成 100% |
| 8 | 計畫閘門 | 沒有計畫時 Read 被擋（訊息提到 plan_steps），ToolSearch 放行；有計畫後 Read 放行 |
| 9 | 完成 | 「✓ 全部完成 · 建立登陸頁 · 花了 2分14秒」（標題是 Haiku 取的）；5 秒後縮成一行 |
| 10 | Esc／API 錯誤 | 「■ 已停止 · … · 你按了 Esc」；429 →「⚠ 卡住了：你已達到使用上限，請稍後再試」 |

**還沒驗到的**：在真實 session 裡 hot reload 後的實際畫面（送出請求、看計畫出現、
權限提示、按鈕切換、重開後的設定）。這要等 mod 在這個 session 載入後，
由使用者送一個請求來實測。

**實測（同一天）**：hot reload 啟用後送出「幫我寫一首關於貓的短詩」。
`plan_steps` 回 `Planned 2 steps. The first one has started.`，兩次 `report_progress`
都回 `Progress noted: 100%.`。使用者確認畫面都正常，包括計畫出現、工具列隱藏、
全部完成後縮成一行、按鈕切換。權限提示和重開後的設定這次沒有特別觸發，
只有測試涵蓋。

## 2026-10-07　clean-view 0.2.0：Agent Dock

`claude plugin validate`：通過。15 個 Dock 掛點加上原本 Clean View 的掛點都列得出來，
matcher 都是寫死的字串（`agent-dock`），沒有 `?`。

型別檢查（TypeScript 5.6，API 宣告，不含這台電腦的 458 個 MCP 工具）：0 個錯誤。

`claude plugin test`：23 個全過，Clean View 14 個、Dock 9 個。

| # | 測試 | 看到的結果 |
|---:|---|---|
| 1 | `parseSize` | `"10"`→10、`" 25 "`→25；`"0"`、`"101"`、`"abc"`、`"2.5"`→null |
| 2 | 徽章 | `比價：Gontran Cherrier`→`GC`、`比價：PAUL 台北`→`PA`、純中文→`01` |
| 3 | 人數不沿用 | 存 50 → 新 session 面板選中 1；存 10 → 還是 10 |
| 4 | 拆工指示 | 5 人時 context 剛好是 `instruction(5)`（含 `exactly 5`）；1 人時沒有 context |
| 5 | 上限 | 5 人時第 6 個 Agent 被擋：`Team Size is 5: this request already has 5 helpers…` |
| 6 | 補送提醒 | 10 人只用了 3 位 → 送一次 `You used 3 of 10 helpers…`；第二輪結束沒有再送 |
| 7 | 排隊與卡片 | 同時上限設 1：1 位進行中、2 位排隊（terminal、desktop 都有）；helper 回報 60 → 卡片 60%；依序遞補後 3 張都是 100% |
| 8 | 總結 | `✓ 3 位助手完成「研究烘焙坊定價」，花了 …` |
| 9 | `/dock` | 開 → 關，狀態列徽章 `◆ Dock 待命 · 團隊 3 人`；`abc` 和 `50` 的回覆都正確 |

**實測一（人數 1）**：請求「幫我研究台北三家知名烘焙坊的可頌價格」，我自己拆成 3 位 helper。
- agents-now 檔案：工作中 3 → 完成 3、卡住 0。
- 使用者確認：卡片、進度條、任務列和總結都有看到。
- 但徽章看不到字，修正方式記在 DECISIONS。

**實測二（人數 3）**：先 `/dock 3`（回覆「團隊人數設為 3。」），再送出「比較 Starbucks、Louisa、cama 三家咖啡店在台北的中杯拿鐵價格」。
- 請求帶上了 `Agent Dock — Team Size is 3` 的拆工指示，我照指示一次派出 3 位。
- agents-now 檔案：`teamSize 3`、工作中 3。
- 使用者確認英文徽章看得到。

**沒驗到的**：
- 50 人（使用者錄影時自己跑）。
- 超過 20 人的確認框實際畫面。
- 超過同時上限的真實排隊（只有測試涵蓋）。
- Esc 中斷排隊中的 helper。
- 「快速省錢」實際把 helper 換成 Haiku：只看得到 Dock 有改寫呼叫，沒有回頭確認 helper 實際用的模型。
- `~/.claude/mods/clean-view` 在新 session 的載入：要開新視窗才會生效。
