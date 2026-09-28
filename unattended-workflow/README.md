# unattended

> 這是 [ai-toolkit](../README.md) 底下的一個 plugin。以前住在獨立 repo
> `johnshaw77/claude-unattended-workflow`，那邊已經封存，正本在這裡。

讓 Claude Code 能**一路做到底再回報**，而不是做兩步就停下來問你——並且把每次
對話存成可調閱的 HTML。

適合的情境：丟一份規格給它、去忙別的、回來看結果。

## 完整流程

```
  /unattended:spec ──► 你審一遍 ──► /clear   ──► /unattended:mode ──► 回來看
  │                    │            │            │                    │
  談出規格             最後把關     清掉脈絡     離開現場             調閱紀錄
  SPEC.md                                        tmux + 走人          transcripts/
                                                                      DECISIONS.md
                                                                      VERIFICATION.md
```

**槓桿在第一步。** SPEC 的品質直接決定產出品質——寫得含糊，回來看到的就是
含糊的東西。花 15 分鐘把規格談清楚，比事後修 3 小時划算。

第二步也別跳過：規格交出去之後，就沒有人能回答問題了。

**第三步看起來矛盾——剛審完就清掉？** 不矛盾：審查的產出是**對 SPEC.md 的
修改**，不是脈絡。你抓到的每一件事只要寫回檔案就完整保留（所以要改就趁 clear
之前改）。清掉的只有談話過程——包括你提過又否決掉的做法，那些留著只會在執行時
被當成有效資訊撿回去用。

而且這一步等於**免費的壓力測試**：清完發現它不知道某件事，代表 SPEC.md 漏寫了，
而你此刻還在，補五分鐘就好。反正你走之後它本來就問不到人，早點發現比較好。

## 安裝

照順序做，大約 5 分鐘。

### 步驟 0：確認你的環境走哪一條

| # | 環境 | 建議 | 能用的功能 |
|---:|---|---|---|
| 1 | macOS | 直接裝 | 全部 |
| 2 | Linux | 直接裝 | 全部 |
| 3 | Windows + WSL | Claude Code 與專案都放在 WSL 裡，當成 Linux 裝 | 全部 |
| 4 | Windows 原生 | Git Bash + `--no-tmux` | 全部，但無人值守時視窗不能關、電腦不能睡 |

> Windows 原生這條路目前是依腳本內容推斷並在 macOS 上模擬驗證，**尚未在 Windows
> 實機跑過**。踩到問題請回報，或補進 `docs/TROUBLESHOOTING.md` 的 Windows 那節。

### 步驟 1：裝相依工具

| # | 工具 | 用途 | 沒有的話 |
|---:|---|---|---|
| 1 | `bash` | 四個 hook 都是 bash 腳本 | **完全不會運作** |
| 2 | `jq` | hook 解析輸入、輸出 JSON | **完全不會運作**（對話開始時會顯示提示） |
| 3 | `python3` 或 `python` | 對話紀錄轉 HTML（只用標準庫，不必 `pip install`） | 只有存檔失效，其餘正常 |
| 4 | `tmux` | `unattended` 指令在背景跑、可以脫離再接上 | 改用 `--no-tmux` 前景執行 |
| 5 | Claude in Chrome 擴充功能（Chrome 線上應用程式商店搜尋 Claude） | UI 改動的瀏覽器驗證（Web 完成定義、守門員都要求） | 改到 `.vue`、`.tsx` 等畫面檔時守門員會擋一次，Claude 會回報「UI 未經瀏覽器驗證」 |

**macOS**：

```bash
brew install jq tmux
```

`python3` 通常已經有了（裝過 Xcode Command Line Tools 就有）；沒有的話 `brew install python`。

**Linux / WSL**（Debian、Ubuntu）：

```bash
sudo apt install jq tmux python3
```

**Windows 原生**（PowerShell）：

```powershell
winget install Git.Git          # 提供 Git Bash——plugin 的 hook 必須靠它執行
winget install jqlang.jq
winget install Python.Python.3.12
```

裝完**重開終端機**，確認三個都找得到：

```bash
jq --version && (python3 --version || python --version) && bash --version | head -1
```

Windows 上 `python --version` 如果跳出 Microsoft Store，代表 Python 沒裝好——
到「設定 → 應用程式 → 進階應用程式設定 → 應用程式執行別名」把 `python.exe`
的商店別名關掉。

### 步驟 2：安裝 plugin

在 Claude Code 裡輸入：

```
/plugin marketplace add johnshaw77/ai-toolkit
/plugin install unattended
```

（以前裝過舊的 `claude-unattended-workflow` marketplace 的話，先
`/plugin marketplace remove claude-unattended-workflow` 再跑上面兩行，
否則會有兩份互相打架。）

然後**完全關掉 Claude Code 再重開**——hook 是在對話開始時載入的，不重開不會生效。

確認有裝好：

```bash
claude plugin list        # 應該看到 unattended@ai-toolkit，Status: ✔ enabled
```

重開後在 Claude Code 輸入 `/unattended:`，應該會列出 `spec`、`mode`、
`transcripts`、`install-bin` 四個指令。

### 步驟 3：接上 `unattended` 指令（選配，但建議）

`unattended` 是在終端機直接啟動無人值守的指令（`unattended --loop` 可以讓
SPEC.md 每一項各開一場全新對話）。裝 plugin 時它已經下載到你電腦上了，
只是還沒接上 PATH。在 Claude Code 輸入：

```
/unattended:install-bin
```

它會依平台自己處理（macOS／Linux／WSL 建 symlink，Windows 在 `~/.bashrc` 加 alias），
**完成後開一個新的終端機**，確認：

```bash
unattended --help
```

詳細說明見[選配：一鍵啟動腳本](#選配一鍵啟動腳本)。

### 步驟 4（Windows 原生才需要）：關掉睡眠

Windows 預設閒置一段時間就會睡眠，無人值守會整個停住、而且沒有任何錯誤訊息。
到「設定 → 系統 → 電源」，把**接上電源時**的睡眠改成「永不」。

### 之後怎麼更新

```bash
claude plugin update unattended
```

然後重開 Claude Code。`unattended` 指令指向 plugin 的目錄，會跟著一起更新，
不用重跑 `install-bin`。

更新後沒生效，先確認裝的是哪一版——見 `docs/TROUBLESHOOTING.md`
的「先確認你裝的是哪一版」。

### 移除

```
/plugin uninstall unattended
```

有跑過 `install-bin` 的話，另外刪掉：

- macOS／Linux／WSL：`rm "$(command -v unattended)"`，以及 `~/.zshrc`（或 `~/.bashrc`）裡
  `# unattended plugin（/unattended:install-bin）` 那一行和它下面一行
- Windows：`~/.bashrc` 裡同一個標記行和它下面的 `alias unattended=…`

### 裝完之後從哪裡開始

1. 在要做的專案裡開 Claude Code，跑 `/unattended:spec 要做什麼的簡述`，把需求談成 SPEC.md。
2. 讀過 SPEC.md、改完後 `/clear`。
3. 開分支，`/unattended:mode 依 SPEC.md 完成全部功能`，或在終端機 `unattended --loop`。
4. 回來看 `docs/transcripts/index.html`、`docs/DECISIONS.md` 和 git log。

完整說明見上面的[完整流程](#完整流程)與下面的各節。

### Windows 的其他注意事項

- Python 叫 `python` 而不是 `python3`——plugin 兩個都會試，不用特別處理。
- **原生 Windows 沒有 `tmux`**：`install-bin` 裝的 alias 已經帶 `--no-tmux`。
  `/unattended:mode` 指令本身不受影響。
- 本 repo 用 `.gitattributes` 把腳本固定成 LF。如果 hook 報
  `$'\r': command not found`，見 `docs/TROUBLESHOOTING.md` 的 Windows 那節。
- 排錯文件裡的 `lsof` 指令在 Windows 要換成 `netstat -ano | findstr :5173`。

## 它做五件事

### 1. 常駐工作準則

每次對話開始時注入，不必在每個專案的 `CLAUDE.md` 重複寫：

- **決策**：實作細節（函式庫、檔案切分、命名）直接採用推薦方案繼續做，不停下來問；
  但**要新建專案、或動一個跨多檔案的功能時，會先把範圍講給你點頭再開工**——
  範圍大就走 `/unattended:spec`。另外「不可逆損害」與「需求有兩種相反解讀」
  也一樣會先問。
- **Web 完成定義**：測試全綠 + UI 改動要用 Chrome MCP 實際走一次流程並截圖 +
  console 零 error/warning + 回報要具體。
- **後端完成定義**：改了 API 就要真的打一次 endpoint（正常與錯誤路徑都打）、
  看服務 log、確認 migration。框架不拘，Fastify / Express / FastAPI / Django / Go
  都適用。
- **Docker**：有 compose 就用 compose 跑，不要手動起服務。改了程式要確認容器
  真的重建。`down -v` 會刪資料，一定要先問。
- **文件分流**：README 保持精簡；取捨寫 `docs/DECISIONS.md`、驗證寫
  `docs/VERIFICATION.md`，兩者逐次追加不改寫。
- **子 agent**：探索（找程式碼、讀懂模組、查成因）派出去省脈絡；實作與驗證
  留在主線，因為證據要留在使用者翻得到的紀錄裡。
- **Git**：互動開發時不自己 commit，永遠不自己 push。commit 訊息（含標題）
  一律繁體中文，技術名詞保留原文。
- **脈絡壓縮後先重讀檔案**：自動壓縮之後（SessionStart 的 source 是 `compact`）
  追加一段提醒——先讀 `SPEC.md` 勾選狀態、`git log`、`docs/DECISIONS.md`
  再繼續，摘要和檔案對不上時以檔案為準。

> Plugin 無法寫入你的 `~/.claude/CLAUDE.md`，所以改用 SessionStart hook 注入，
> 效果相同。你自己的 CLAUDE.md 仍然有效，兩者會疊加。

### 2. 把想做的東西談成規格

```
/unattended:spec 一個給團隊用的請假系統
```

它會先看專案現況（技術棧、有沒有 compose、測試指令叫什麼），然後跟你把功能
拆成可驗收的項目，產出 `SPEC.md`，並**順手把對話存檔打開**（見下面第 5 點）：

| 區塊 | 內容 |
|---|---|
| F1、F2… | 功能項目，每項有自己的完成條件。粒度以「一項對應一顆 commit」為準 |
| 完成的定義 | **客觀到無法自我欺騙**的驗收條件 |
| 實作順序 | 純邏輯的排前面、UI 排後面，每完成一項就跑測試 |
| 取捨授權 | 哪些細節可以自己決定、卡住時怎麼辦 |

**這是整套流程中唯一會主動問你問題的指令**——因為你此刻還在，而規格交出去
之後就沒人能澄清了。它也會主動把含糊的條件改掉：

| ❌ 你可能會這樣寫 | ✅ 它會改成 |
|---|---|
| 測試要充足 | `npm test` 全綠，且 F1+F2 合計不少於 15 個案例 |
| UI 要能正常使用 | Chrome MCP 走過：新增 → 練習 → 答對答錯 → 看到總結 |
| API 要能用 | `POST /api/x` 正常回 201、缺欄位回 400 且訊息指出欄位名 |

沒有「取捨授權」那一節的話，無人值守會停在第一個「配色要用什麼」等你——
這是最常見的失敗原因。

#### 第二輪之後

`SPEC.md` 是**這一輪的工單**，不會長大。再跑 `/spec` 時它會：

1. 讀舊 SPEC、README、`git log`，判斷哪些真的做完了
2. 把舊的整份歸檔到 `docs/specs/<日期>-<簡述>.md`，開頭註明本輪結果
3. 新的 `SPEC.md` 只留「上輪沒做完的」+「這輪新的」

已完成的項目不會再出現在 SPEC 裡。「產品現在有什麼功能」是 README 的事，
「當初為什麼那樣做」是 `docs/DECISIONS.md` 的事。

這樣第五輪的 SPEC 仍然只有一頁，而不是 500 行裡有 400 行是歷史。

### 3. 完成度守門員（Stop hook）

Claude 想結束回合時攔一次，檢查三件事：

**一、測試與型別（只在無人值守模式）**。支援多種語言，並且**認得 monorepo**——
它會從這次改動的檔案往上找最近的專案根，只跑被影響到的那些：

| 偵測到 | 執行 |
|---|---|
| `package.json` | `npm run test`、`npm run typecheck`（有才跑） |
| `pyproject.toml` / `pytest.ini` | `pytest -q`，依序找 `.venv`、`venv`、`uv run`（有 `uv.lock` 時）、PATH；**有測試檔卻都找不到 pytest 會擋下**，不會跳過 |
| `go.mod` | `go test ./...` |
| `Cargo.toml` | `cargo test` |

改 `frontend/` 不會被 `backend/` 的失敗連累，反之亦然。

兩個省時間的規則：

- **互動模式不跑測試。** 你人在場，每個回合結束都等整套測試跑完太浪費，
  而且常常是「先改一半、還不想測」。第二、三項照樣檢查（幾乎零成本）。
- **無人值守時，agent 已經跑過就不重跑。** 最後一次改這個專案的檔案之後，
  agent 自己跑過對應的測試指令、而且沒有失敗，就信任那次結果。
  指令裡有 `|` 或 `;` 的不算——`pytest | tail -20` 的 exit code 是 `tail` 的，
  測試失敗也會看起來成功。

**二、改了 UI 卻整場沒用過 Chrome MCP** → 擋下來要求實測。

**三、改了 API／路由卻整場沒打過任何 endpoint** → 擋下來要求真的呼叫一次。
（偵測 `curl`、`httpie`、`requests`、`fetch`、`TestClient`、`supertest`、`httpx`，
或用過瀏覽器。）

**子 agent 做的事也算數。** 子 agent 的工具呼叫不會出現在母 session 的紀錄裡
（母檔只看得到一次 `Agent` 呼叫），所以守門員會連同 `subagents/agent-*.jsonl`
一起掃。少了這一步，把實作外包出去就等於把守門員關掉，而且它會**安靜地放行**。

**只擋一次**（檢查 `stop_hook_active`），避免服務起不來時無限迴圈。
它是提醒，不是牢籠。

這場對話沒改過檔案、或找不到任何專案根，都會直接放行。
專案要整個豁免就建立 `.claude/.no-verify`——但那會連第二、三項一起關掉，
而那兩項正是無人值守時唯一的防線。只是嫌測試慢的話，上面兩條規則已經處理掉了。

### 4. 互動／無人值守模式切換

```
/unattended:mode 把 SPEC.md 六項功能做完     開啟
/unattended:mode off                          關閉
/unattended:mode status                       查詢
```

開關是標記檔 `<專案>/.claude/UNATTENDED`——用檔案而不是靠語氣推測，因為
「要不要自動 commit」不該建立在猜測上。

| | 互動開發（預設） | 無人值守 |
|---|---|---|
| 遇到抉擇 | 可以問你 | 一律自己決定，理由寫進 `docs/DECISIONS.md` |
| commit | 不自動做 | 每完成一項 + 測試綠就 commit |
| 分支 | 你決定 | 一定在 `feat/*`，不動 `main` |
| push | 要你明說 | 永遠不做 |
| 卡住 | 問你 | 試兩次就跳過（SPEC.md 標 `- [-]`），最後在 README 說明 |
| 進度 | — | 完成一項就把 SPEC.md 那行改成 `- [x]`，跟實作同一個 commit |

開啟時它會順手做兩件事，因為那是最後一次能打擾你的時機：

- **把對話存檔打開**（建立 `docs/transcripts/`）——無人值守正是最需要事後
  調閱的情境，而多數人不會記得另外去開。
- 檢查 git：不是 repo 會問要不要 `git init`；還在 `main` 上會幫你開分支。

#### 守衛：最傷的幾條不只是文字

上表的「永遠不 push」之類是注入的準則，模型遵守的機率再高也不是 100%，
而 `--loop` 又是用 `bypassPermissions` 跑，沒有人會看到權限詢問。
所以 `PreToolUse` hook（`hooks/guard.sh`）在 Bash 指令執行前直接攔：

| 指令 | 互動開發 | 無人值守 |
|---|---|---|
| `git push` | 跳確認 | 拒絕 |
| `docker compose down -v`（`--volumes`） | 跳確認 | 拒絕 |
| 在預設分支（`main`／`master`）上 `git commit` | 不管 | 拒絕 |

判斷的是每一段指令的**子指令**，不是整串字：`git commit -m "修正 push 通知"`
不會被當成 push。包在 `bash -c "…"` 或腳本檔裡的指令攔不到——它是安全網，不是沙箱。

⚠️ **標記檔記得刪**，否則那個專案之後每次對話都會是無人值守。
不確定就跑 `/unattended:mode status`。

### 5. 對話紀錄存成 HTML

```
/unattended:transcripts
```

把這個專案歷次對話轉成 HTML 放進 `docs/transcripts/`，含索引頁與全文搜尋。
提問與回覆直接展開，思考過程、工具呼叫、工具輸出預設摺疊。

### 存檔有兩層，搞混的話會以為壞掉了

| | 專案內 `docs/transcripts/` | 全域 `~/.claude/transcripts/` |
|---|---|---|
| 要不要啟用 | **要**——資料夾存在＝開，不存在就完全不寫 | 不用，一律更新 |
| 誰會幫你開 | `/unattended:transcripts`、`/unattended:spec`、`/unattended:mode` | — |
| 收錄範圍 | 只有這個專案 | 所有專案 |
| 拿來做什麼 | 跟著專案走、可以分享給團隊 | 自己事後調閱 |
| 進不進 git | **預設不進**（資料夾內有 `.gitignore`） | — |

**新專案預設是關的**，這是刻意的——不然 plugin 會在別人的每個 repo 裡長出
一個資料夾。代價是你如果沒跑過上面任何一個指令，`docs/transcripts/` 不會出現，
看起來就像存檔壞掉。這時候先確認那個資料夾在不在。

不想要專案內這一份就刪掉資料夾，開關立刻關上。

更新時機有兩個，**無人值守能不能事後調閱全靠前者**：

| 時機 | 動作 | 為什麼需要 |
|---|---|---|
| 每輪回合結束（Stop） | 只重轉**這一場**對話（約 0.2 秒） | 無人值守一跑好幾小時，中途沒有 SessionEnd；沒有這個觸發點就只看得到「上一場」對話 |
| 對話結束（SessionEnd） | 整個專案重掃一遍 | 補上任何漏掉的 session |

tmux 被 `kill-session` 強制砍掉時 SessionEnd 根本不會執行——有了 Stop 這個
觸發點，紀錄最多只會落後一個回合。

⚠️ **預設不進版控**：紀錄是逐字保留的，包含所有工具輸入輸出，可能含 `.env`
內容或 token。所以 plugin 每次寫入時都會確保 `docs/transcripts/.gitignore` 存在
（內容是 `*`）。確定要 commit 的話，先掃過：

```bash
grep -rioE "api[_-]key|secret|password|token|BEGIN.*PRIVATE KEY" docs/transcripts/*.html
```

沒問題再把那個 `.gitignore` 裡的 `*` 刪掉——**檔案本身要留著**，plugin 只在
它不存在時才寫回來。

以前已經 commit 過紀錄的專案，`.gitignore` 對那些檔案無效，要自己移出版控：

```bash
git rm -r --cached docs/transcripts && git commit -m "對話紀錄移出版控"
```

## 搭配 tmux 使用

Claude Code 是終端機程序，關掉視窗就中斷。要真的走人，讓它住在 tmux 裡：

```bash
tmux new-session -s claude
cd <專案>
claude
# 貼任務，然後 Ctrl+b 放開再按 d 脫離，現在可以關掉編輯器
tmux attach -t claude   # 回來接上
```

被中斷了可以 `claude --resume` 或 `claude -c` 接續。

### 選配：一鍵啟動腳本

`bin/unattended` 把「建立標記檔 + 開 tmux + 啟動 Claude Code」包成一個指令。

**裝 plugin 時它就已經在你電腦上了**——`/plugin marketplace add` 會把整個 repo
clone 到 `~/.claude/plugins/marketplaces/ai-toolkit/`，`bin/` 就在
`unattended-workflow/bin/`，不用另外從 GitHub 下載。只是 plugin 不能動你的 PATH，
所以要接上一次：

```
/unattended:install-bin
```

它會判斷平台自己處理：

| 平台 | 做法 |
|---|---|
| macOS / Linux / WSL | 在 PATH 裡建 symlink；`~/.local/bin` 不在 PATH 就加進 `~/.zshrc`／`~/.bashrc` |
| Windows（Git Bash） | 在 `~/.bashrc` 加上帶 `--no-tmux` 的 alias（Git Bash 的 `ln -s` 預設是複製） |

一律指向 marketplace 目錄，所以 `claude plugin update` 之後自動就是新版。
以前用 `cp` 複製過的舊版會被換掉；PATH 裡有不相干的同名檔案則不會覆蓋。
可以重複執行。有改 rc 檔的話，要開新的終端機才找得到指令。

<details>
<summary>手動安裝（不想讓指令改 rc 檔的話）</summary>

**不要用 `cp` 複製**——複製出去的那份不會跟著 plugin 更新。

macOS / Linux / WSL：

```bash
mkdir -p ~/.local/bin
ln -sf ~/.claude/plugins/marketplaces/ai-toolkit/unattended-workflow/bin/unattended ~/.local/bin/unattended
# 確認 ~/.local/bin 在 PATH 裡，沒有的話加進 ~/.zshrc
```

Windows（Git Bash）：

```bash
echo "alias unattended='bash ~/.claude/plugins/marketplaces/ai-toolkit/unattended-workflow/bin/unattended --no-tmux'" >> ~/.bashrc
source ~/.bashrc
```

</details>

然後：

```bash
cd <專案>
git checkout -b feat/xxx
unattended "把 SPEC.md 的六項功能做完"
tmux attach -t claude-<專案>      # 進去貼任務
```

它會先檢查 tmux 與 claude 存在、session 沒重複、目前不在 `main` 上，
並在 claude 結束時自動清掉標記檔。標記檔會順手寫進 `.git/info/exclude`，
不會被 commit。

不裝也完全沒差——`/unattended:mode` 指令加上手動開 tmux 是一樣的效果。
`unattended --help` 看全部選項。

#### 沒有 tmux：`--no-tmux`

不開 tmux，直接在目前的終端機前景執行。給 Windows（Git Bash）用，
或是不想裝 tmux 的人：

```bash
unattended --no-tmux                 # 單場：直接啟動 claude，結束時清掉標記檔
unattended --loop --no-tmux          # 迴圈：在這個視窗一項一項跑
```

代價：**視窗不能關、電腦不能睡**，也沒辦法「脫離之後再接上」。
中途要停就按 Ctrl+C，標記檔會自動清掉。

| 平台 | 建議 |
|---|---|
| macOS / Linux | 裝 tmux，不加 `--no-tmux` |
| Windows + WSL | 在 WSL 裡裝 Claude Code 與 tmux，當成 Linux 用（專案要放在 WSL 的檔案系統裡，放 `/mnt/c/` 會很慢） |
| Windows 原生 | Git Bash + `--no-tmux`，並關掉睡眠 |

> ⚠️ Windows 上的 `--no-tmux` 是依腳本用到的指令（bash、grep、awk、git、tee）
> 推斷可以運作，**尚未在 Windows 實機驗證**。遇到問題請回報。

### 迴圈模式：每一項一場全新對話

無人值守時沒有人能 `/clear`，一場對話跑十項，後面幾項是在壓縮過好幾次的脈絡下
做的——摘要會漏掉被否決的做法、某段程式為什麼那樣寫。`--loop` 把 SPEC.md 的
**每一項拆成一場全新的 `claude -p` 對話**，等於每項之間自動 `/clear`：

```bash
cd <專案>
git checkout -b feat/xxx
unattended --loop                             # 讀 SPEC.md，一項一場
unattended --loop "備註" -- --model sonnet    # -- 之後的參數原樣交給 claude
unattended --loop --no-tmux                   # 沒有 tmux（Windows）：前景執行
```

| 情況 | 迴圈怎麼做 |
|---|---|
| 這一輪讓沒打勾的項目變少 | 算有進展，下一輪做下一個 `- [ ]` |
| 沒變少 | 同一項再給一輪；**連續兩輪**都沒進展就改成 `- [-]`、commit、跳過 |
| `claude` 異常結束（額度用完、斷網） | 不算卡住，等 5、10 分鐘重試同一項；連續 3 次就停 |
| 全部處理完 | 再開一場收尾：README「未完成事項」、回報完成／跳過／commit |

需要的前提：

- **SPEC.md 用核取方塊格式**（`/unattended:spec` 產出的就是）：每項標題行頂格
  寫 `- [ ] **F1** …`，完成條件縮排、不用核取方塊。迴圈只數頂格的 `- [ ] `。
- 是 git repo——跳過與進度都靠 commit。
- 過程寫在 `.claude/unattended-loop.log`（同樣進 `.git/info/exclude`）；
  有開對話存檔的話 `docs/transcripts/` 每一輪都會多一場。

⚠️ 迴圈用 `--permission-mode bypassPermissions` 跑——`-p` 模式沒有人能按
「允許」，不這樣就會卡在第一個權限詢問。只在你信任的專案、分支上用。

| | 單場（`unattended`） | 迴圈（`unattended --loop`） |
|---|---|---|
| 脈絡 | 一路累積，靠自動壓縮 | 每項重新開始 |
| 看它邊做邊想 | `tmux attach` 即時看 | 只看得到每輪最後輸出；過程看 transcripts |
| 任務怎麼給 | 接上去貼 | 不用給，SPEC.md 就是任務 |
| 適合 | 3–5 項、彼此緊密相關 | 項目多、跑一整晚 |

## 進階：前後端平行開發

想讓兩場 session 同時做前端和後端（先定資料規格、前端用 mock），
看 [`docs/PARALLEL.md`](docs/PARALLEL.md)。那是一份用現有工具組起來的操作說明，
plugin 本身沒有為此新增功能。多數 side project 其實不值得拆，文件開頭有判斷方式。

## 走人前檢查清單

- [ ] Claude Code 跑在 tmux 裡
- [ ] 已用 `/spec` 寫好 `SPEC.md`，而且**你讀過一遍**
- [ ] 讀完、確認過之後**跑了 `/clear`**（談規格的脈絡對執行只有害處）
- [ ] 任務有**客觀的**完成條件（測試全綠 / 某個檔案產出）
- [ ] `docs/transcripts/` 存在（`/spec` 或 `/mode` 會順手建；沒有就跑 `/transcripts`）
- [ ] 已 `/unattended:mode <備註>` 開啟無人值守（或用 `unattended --loop`，這條就不必）
- [ ] SPEC.md 每項是頂格的 `- [ ] **F1** …`（進度靠勾選，`--loop` 必要）
- [ ] 在分支上，不是 `main`
- [ ] dev server 的 port 沒被別的服務佔用（**驗證時先確認 `<title>` 是自己的專案**）

## 你的專案會長成這樣

```
<專案>/
├── SPEC.md                 這一輪的工單（每輪重寫）
├── README.md               產品現況（改寫，保持精簡）
└── docs/
    ├── specs/              歷輪工單的歸檔
    ├── DECISIONS.md        取捨與理由（追加）
    ├── VERIFICATION.md     每輪驗證看到什麼（追加）
    └── transcripts/        對話紀錄 HTML（存在＝啟用自動存檔）
```

判斷一份內容該放哪，問一句就好：**「下次會被改寫，還是會再多一段？」**
會多一段的就分流出去，SPEC.md 則是唯一「用完就過期」的那個。

## 這個 plugin 的檔案結構

```
hooks/
  session-start.sh        注入常駐準則 + 偵測無人值守模式
  guard.sh                PreToolUse：攔 git push、down -v、無人值守時在 main 上 commit
  verify-gate.sh          Stop：測試沒綠、UI 沒驗過就擋
  archive-transcript.sh   Stop：更新這場對話的 HTML／SessionEnd：整個專案重掃
commands/
  spec.md                 /unattended:spec
  mode.md                 /unattended:mode
  transcripts.md          /unattended:transcripts
  install-bin.md          /unattended:install-bin
scripts/
  transcript2html.py      JSONL → HTML（純標準庫）
  install-bin.sh          把 bin/unattended 接上 PATH（/unattended:install-bin 呼叫）
bin/
  unattended              選配：一鍵啟動／--loop 每項一場新對話（需自行放進 PATH）
```

## 遇到問題

看 [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)：守門員沒擋、改了 plugin
沒生效、**埠口衝突導致驗證假通過**、存檔沒產生、無人值守關不掉、`--loop` 行為不如預期、Windows。

## 授權

MIT
