# 前後端平行開發：操作說明

這份是**做法**，不是功能。Plugin 沒有為平行開發新增任何指令或 hook，
底下每一步都是用現有的東西（`/unattended:spec`、`/unattended:mode`、
`git worktree`、tmux）手動組起來的。

之所以不做成功能：它會綁死技術棧（OpenAPI、MSW……）、讓核心依賴 tmux，
而且協調規則會注入到每一場用不到它的對話裡。先照這份手動跑，真的反覆用到、
而且每次卡在同一步，再考慮把那一步做成指令。

## 先問：值得拆嗎？

| 情況 | 建議 |
|---|---|
| 十來個 endpoint、幾個畫面的 side project | **不要拆**。一場 session 照「規格 → 後端 → 前端」依序做 |
| 前後端各自都要做好幾小時，而且交界清楚 | 可以拆 |
| 資料結構還在摸索、需求會邊做邊變 | **不要拆**。規格一直變，平行只會變成兩邊一直對不上 |

瓶頸通常是整合與驗證，不是打字速度。平行省下的時間，常常在整合時
花在修規格不一致上。

## 為什麼是兩場 session，不是兩個子 agent

注入的準則寫著「子 agent 負責搞清楚，不負責動手」——實作與驗證要留在主線，
因為證據要留在使用者翻得到的紀錄裡。兩個子 agent 各做一半，主線只拿到結論。

兩場 session 則各自是自己那一塊的主線：各有一份對話存檔、各有守門員。

## 流程總覽

```
階段 0（你在場）   主目錄，main
                   /unattended:spec → SPEC.md + contract/
                   你審過、commit
                           │
          ┌────────────────┴────────────────┐
階段 1    ../myapp-api  feat/api            ../myapp-web  feat/web
（平行）  實作後端                          對著 mock 做前端
          驗證：回應符合規格                驗證：UI 對得上 mock
          規格凍結，不改                    規格凍結，不改；缺什麼記下來
          └────────────────┬────────────────┘
                           │
階段 2    主目錄，feat/integrate
（整合）  merge 兩條分支 → 關掉 mock → 對著真的後端走一遍 ← 到這裡才算做完
```

## 階段 0：規格（你要在場）

用 `/unattended:spec` 談規格，多交代一件事：**資料規格要寫成機器讀得懂的檔案**，
不能只是 markdown 裡的一張表。

| 形式 | 適合 |
|---|---|
| `contract/openapi.yaml` | REST，前後端不同語言 |
| 共用型別（TypeScript / zod），放在 `packages/shared/` 之類 | 前後端都是 TS 的 monorepo |
| `contract/*.graphql` | GraphQL |

選哪個不重要，重要的是兩件事都能從它**自動產生**：前端的 mock、後端的回應檢查。
這樣兩邊各自對規格負責，不需要彼此對話。

SPEC.md 裡要寫清楚：

- **哪幾項是後端、哪幾項是前端**——兩場 session 會拿同一份 SPEC.md，各做各的。
- **埠口**：後端固定一個（例如 8000），前端 dev server 固定另一個，兩邊不能搶。
- **mock 開關**：用一個環境變數切換（例如 `VITE_USE_MOCK=1`），預設關。
  關掉時前端必須真的打後端，不能偷偷退回 mock。
- 每一項的**客觀完成條件**，跟平常一樣。

建議的目錄結構（守門員會從改動的檔案往上找 `package.json` / `pyproject.toml`，
所以前後端分開放，各自只跑自己的測試）：

```
myapp/
├── SPEC.md
├── contract/
│   └── openapi.yaml
├── api/          後端（pyproject.toml 或 package.json）
└── web/          前端（package.json）
```

審完之後 **commit 到 main**，再開 worktree——worktree 是從 commit 長出來的，
沒 commit 的規格另一邊看不到。

## 階段 1：平行開發

### 開兩個 worktree

```bash
cd myapp
git worktree add ../myapp-api -b feat/api
git worktree add ../myapp-web -b feat/web
```

⚠️ **每個 worktree 都要確認 `docs/transcripts/` 存在。** 那個資料夾預設不進
版控，主目錄有、worktree 裡一定沒有——沒有的話那一場完全不會存檔。
`/unattended:mode` 開啟時會順手建；用 `bin/unattended` 啟動的話它不會建，
進去之後跑一次 `/unattended:transcripts`。

### 各開一場無人值守

```bash
cd ../myapp-api && unattended "只做 SPEC.md 的後端項目"   # tmux: claude-myapp-api
cd ../myapp-web && unattended "只做 SPEC.md 的前端項目"   # tmux: claude-myapp-web
```

沒裝 `bin/unattended` 就各開一個 tmux、進目錄啟動 `claude`、跑 `/unattended:mode`。

### 給兩場的任務要多交代的事

兩場共用的：

> - 只做 SPEC.md 裡標為「後端／前端」的項目，另一邊的不要碰。
> - **`contract/` 在這個階段凍結，不准修改。**
> - 不要改寫或歸檔 SPEC.md，整合階段才處理。

後端多交代：

> - 啟動服務後，用規格檢查實際回應，正常路徑與錯誤路徑都要打。
>   （例如 `schemathesis run contract/openapi.yaml --url http://localhost:8000`，
>   或在測試裡對回應做 schema 驗證。）
> - 發現規格寫錯或做不到，**不要改規格**：照規格能做的做，
>   把問題寫進 `contract/CHANGES.md`。

前端多交代：

> - 從規格產生 mock（例如 MSW，或 `npx @stoplight/prism-cli mock contract/openapi.yaml`），
>   用 `VITE_USE_MOCK=1` 開發與驗證。
> - 發現規格缺欄位或不好用，**不要改規格**：先在 mock 裡補上讓畫面能做，
>   把需求寫進 `contract/CHANGES.md`。

### 為什麼凍結，而不是讓兩邊即時溝通

兩個 worktree 在不同分支，一邊改了規格檔，另一邊根本看不到——除非 commit
再 merge 過去。本機 session 之間雖然可以用 `SendMessage` 傳訊息，但訊息沒有
版本紀錄、對方可能正做到一半，而且**規格改動本來就該由人拍板**，
無人值守期間兩個 agent 自己協商出來的規格，事後很難知道為什麼變成那樣。

凍結的代價是整合時要處理 `CHANGES.md`，但那一刻所有衝突攤在同一個地方，
比散落在兩場對話裡好查。

## 階段 2：整合（這一步不能省）

⚠️ **階段 1 前端的驗證是「假通過」。** 守門員看到開過瀏覽器就放行
（`verify-gate.sh` 把「開過瀏覽器」視同「打過服務」），但它分不出畫面接的是
mock 還是真的後端。對著 mock 截圖只證明 UI 對得上 mock。

在主目錄開一場新的 session，開分支做：

```bash
cd myapp
git checkout -b feat/integrate
git merge feat/api
git merge feat/web
```

整合 session 的任務：

1. **解 merge 衝突。** `docs/DECISIONS.md`、`docs/VERIFICATION.md` 兩邊都在
   檔尾追加，一定會衝突——兩邊的條目都保留，不要擇一。
2. **處理 `contract/CHANGES.md`。** 逐條決定：改規格並同步兩邊，或維持原規格改前端。
   決定寫進 `docs/DECISIONS.md`。拿不定主意、會影響產品行為的，留給你回來決定。
3. **關掉 mock**（`VITE_USE_MOCK` 不設或設 0），後端與前端都跑起來。
   有 `docker-compose.yml` 就用 compose。
4. 用 Chrome MCP 走完整流程，**並確認請求真的打到後端**：
   - 看瀏覽器的 network requests，目標是後端的埠口，不是 mock
   - 看後端 log，確認有收到對應的請求
   - 兩個都要，只看畫面正常不算數
5. 全綠之後才歸檔 SPEC.md 到 `docs/specs/`，更新 README。

### 收尾

```bash
git worktree remove ../myapp-api
git worktree remove ../myapp-web
```

⚠️ worktree 裡的 `docs/transcripts/` 是被 ignore 的，`remove` **不會拒絕，
會直接連同刪掉**。要保留就先複製出來：

```bash
cp -R ../myapp-api/docs/transcripts ./transcripts-api   # remove 之前
```

不保留也沒關係，原始 JSONL 還在 `~/.claude/projects/`，
全域的 `~/.claude/transcripts/` 也會收錄這兩場。

## 檢查清單

階段 0
- [ ] 規格是機器可讀的檔案，不只是 markdown
- [ ] SPEC.md 標明每項屬於前端或後端
- [ ] 埠口、mock 開關都寫死在 SPEC.md
- [ ] 規格已 commit 到 main

階段 1
- [ ] 兩個 worktree 都有 `docs/transcripts/`
- [ ] 任務裡交代了「規格凍結，問題寫進 `contract/CHANGES.md`」

階段 2
- [ ] mock 已關閉
- [ ] 瀏覽器請求打到後端埠口、後端 log 有對應請求
- [ ] `contract/CHANGES.md` 每一條都有結論
