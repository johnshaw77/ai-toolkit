#!/usr/bin/env bash
# SessionStart hook：把工作準則注入這次對話。
#
# Plugin 沒辦法寫入使用者的 ~/.claude/CLAUDE.md，所以改用這個 hook 把
# 「常駐規則」以 additionalContext 的形式送進脈絡，效果等同。
#
# 另外偵測 <專案>/.claude/UNATTENDED，有的話追加無人值守的行為準則。
set -uo pipefail

# stdout 只能有我們要回傳的那一份 JSON。任何子指令不小心印到 stdout 的東西
# 都會弄壞它，所以把 fd 1 整個導到 stderr，另外留 fd 3 給真正的輸出。
exec 3>&1 1>&2

input=$(cat)

# 沒有 jq 就什麼都動不了。與其靜靜失效，不如講清楚為什麼。
if ! command -v jq >/dev/null 2>&1; then
  printf '%s\n' >&3 '{"systemMessage":"unattended-workflow: jq not found, so the workflow rules were not loaded. Install jq (macOS: brew install jq / Windows: winget install jqlang.jq) and restart Claude Code."}'
  exit 0
fi

cwd=$(printf '%s' "$input" | jq -r '.cwd // ""' 2>/dev/null)
[ -n "$cwd" ] || cwd="$PWD"
# startup / resume / clear / compact。compact 時要追加「先重讀檔案」的提醒。
source_kind=$(printf '%s' "$input" | jq -r '.source // ""' 2>/dev/null)

base='## 決策：自己判斷，但先確認做的是對的東西

- **實作層的取捨自己決定**：用哪個函式庫、檔案怎麼切、命名、資料結構怎麼設計——
  直接採用你會推薦的那一個繼續做，動手前用一兩句話說明「選了哪個、為什麼」，
  不要為了這種事停下來等回答。
- **但動工前要先對齊範圍。** 遇到下面任一種情況，先把「我打算做什麼」講成幾句話
  或一份清單，等使用者點頭再開始寫：
  1. 要從零建一個新專案，或新增一個會動到多個檔案的新功能。
  2. 輸入只有一份文件或一句話，其餘內容都要靠你推測補完。
  3. 選錯會造成不可逆損害（刪資料、動別人的分支、對外送出東西）。
  4. 需求本身有兩種完全相反的解讀。

  範圍大就直接用 `/unattended:spec` 談成一份 SPEC.md，**不要憑一輪對話就開始
  寫整個專案**——猜錯方向的成本遠高於多問一次。
- 範圍對齊之後就不要再一步一問：剩下的一律自行判斷、寫清楚假設、一路做到底
  再回報。

## Web 專案的完成定義

三點同時滿足才算做完，沒滿足就繼續做，不要先回報：

1. 測試全綠（`npm test`）；專案若有 `typecheck` 也要通過。
2. UI 改動驗證（強制）：動到任何前端後，用 Chrome MCP 實際走一次使用流程並截圖。
   只做 type-check 不算數。console 不可以有任何 error 或 warning。
3. 回報要具體：說明「驗證了什麼、看到什麼結果」，不要用「應該可以了」這種說法。

開頁面後先確認 <title> 是這個專案的——埠口可能被別的服務佔用，連錯了會對著
別人的畫面截圖還以為驗證通過。

## 後端的完成定義

**改了 API 就要真的打一次 endpoint。** 語言框架不拘（Fastify、Express、FastAPI、
Django、Go 都一樣），通用規則是：

1. 把服務跑起來，確認它**活著**（health endpoint 或任一已知路由回 2xx）。
2. **實際呼叫你改到的 endpoint**，檢查狀態碼與回傳結構——正常路徑與錯誤路徑
   都要打（例如缺欄位、查不到的 id）。
3. **看服務的 log**，確認沒有例外或堆疊追蹤。
4. 動到資料庫的話，確認 migration 已套用、schema 是預期的樣子。

單元測試通過**不等於**服務跑得起來。啟動失敗、路由沒註冊、middleware 順序錯、
環境變數缺漏、依賴注入接錯——這些單元測試全都抓不到，只有真的打一次才會現形。

回報時要寫「打了什麼、拿到什麼」，例如：
`POST /api/users 缺 email → 400 {"error":"email is required"}`。

## Docker

專案有 `docker-compose.yml` / `compose.yaml` 就**用 compose 跑，不要手動起服務**——
手動起的環境變數、網路、依賴服務都跟實際不同，驗過了也不算數。

```bash
docker compose up -d
docker compose ps                          # 確認每個服務都是 running/healthy
docker compose logs --tail=50 <service>    # 看 log（取代 tmux capture-pane）
```

- 改了程式碼後要確認容器**真的重建**了，不是跑舊 image：
  `docker compose up -d --build`，或確認有掛 volume 做 hot reload。
- 服務起不來先看 log，不要瞎猜。
- compose 對外開的埠可能跟別的專案衝突（`docker ps` 看得到）。這是驗證時
  連錯服務的主因，所以開頁面一定要先確認 title。
- **不要自己 `docker compose down -v`**——那會刪掉 volume 裡的資料。要清除資料
  一定要先問使用者。

## 文件要寫到對的地方

README.md 給第一次看到專案的人讀：這是什麼、怎麼跑、結構。保持精簡穩定，
每次是「改寫」不是「追加」。

會逐次累積的東西分流出去（沒有就建立）：

| 檔案 | 放什麼 | 寫法 |
|---|---|---|
| `docs/DECISIONS.md` | 自行判斷的取捨：決定什麼、為什麼、代價 | 追加 |
| `docs/VERIFICATION.md` | 每輪驗證實際看到什麼 | 追加 |

追加時不要改寫既有條目——過去的判斷即使後來被推翻，也是有用的脈絡。

`SPEC.md` 是例外：它是**這一輪的工單**，不是會長大的產品說明書。
不要把新功能追加到既有的 SPEC.md，也不要把已完成的項目留在裡面——
每輪重寫，舊的歸檔到 `docs/specs/<日期>-<簡述>.md`。
產品「現在有什麼功能」是 README 的事。

## 子 agent：負責「搞清楚」，不負責「動手」

派工給子 agent 能省下大量脈絡——它有自己的視窗，回來的只有結論。但要分層：

| 工作 | 派出去？ |
|---|---|
| 探索：找程式碼在哪、讀懂既有模組、查 bug 成因、比對多個檔案 | ✅ 主力用途 |
| 實作（Edit / Write） | ❌ 留在主線 |
| 驗證（開瀏覽器、打 endpoint） | ❌ 留在主線 |
| 跑測試、看 log | ⚠️ 可以，但結果要帶回主線覆述一次 |

理由是**證據要留在主線的紀錄裡**。子 agent 的過程存在另一個檔案，使用者事後
不會去翻；而「驗證」的價值有一半就在於他翻得到。

吃脈絡的大宗其實是探索（讀了二十個檔案只為了確認一件事），把那部分外包就夠了。

## Git

**一般互動開發：不要自己 commit，等使用者說。** 他常常想先看過改動再決定。
（無人值守模式的規則不同，見下方——那時要每完成一項就 commit。）

規則：

- **永遠不要自己 `push`。** commit 是本地的、可以反悔；push 是對外動作，
  一定要使用者明說。
- **commit 訊息一律用繁體中文寫**，標題那行也是，不要寫英文。
  技術名詞與程式識別字（`useEffect`、`docker compose`、檔名、函式名）保留原文。
- 標題用祈使句寫「做了什麼」，例如「修正登入後導向錯誤的頁面」；
  必要時空一行，內文補「為什麼」。PR 標題與說明同樣用繁體中文。
- commit 前先確認 `git status`，不要順手把不相干的檔案一起帶進去。
- 開新 repo 時尊重使用者既有的分支慣例（看 `git config init.defaultBranch`）。

`docs/transcripts/` 預設不進版控（資料夾裡有 plugin 產生的 `.gitignore`），
不要自己把它加回 git。使用者明說要 commit 的話，先掃過一次——那是逐字紀錄，
可能含 `.env` 內容、API key、內部主機名：

```
grep -rioE "api[_-]key|secret|password|token|BEGIN.*PRIVATE KEY" docs/transcripts/*.html
```'

marker="$cwd/.claude/UNATTENDED"
if [ -f "$marker" ]; then
  note=$(head -1 "$marker" 2>/dev/null)
  extra='

---

⚠️ 【無人值守模式】（偵測到 .claude/UNATTENDED）

使用者不在電腦前，不會回答任何問題。上面的規則之外，追加：

1. 絕對不要停下來問問題。抉擇自己做，理由寫進 docs/DECISIONS.md。
   這條**覆蓋上面的「動工前要先對齊範圍」**——使用者此刻不在，SPEC.md 就是
   已經對齊過的範圍；沒有 SPEC.md 就依現有文件做最合理的推斷並寫進 DECISIONS。
2. 每完成一個功能項目、且測試全綠時 commit 一次。切分點是功能項目，不是檔案。
   SPEC.md 的項目是 `- [ ] **F1** …` 格式：完成時把那行改成 `- [x]`，
   **跟實作放在同一個 commit**。進度要寫在檔案裡，不能只存在脈絡裡——
   脈絡會被壓縮，`unattended --loop` 更是每項都開一場全新對話，只看得到檔案。
3. 在分支上做（feat/<項目>），不要直接動 main。
4. 永遠不要 push。
5. 卡住超過兩次嘗試就跳過該項（SPEC.md 那行改成 `- [-]`）、繼續下一項，
   最後在 README 的「未完成事項」說明。
6. 全部做完後回報：完成什麼、跳過什麼、產生哪些 commit。

結束無人值守：刪掉 .claude/UNATTENDED。'
  [ -n "$note" ] && extra="$extra

本次任務備註：$note"
  base="$base$extra"
fi

if [ "$source_kind" = "compact" ]; then
  base="$base

---

🗜 【剛剛發生了脈絡壓縮】

你手上的是摘要，不是原本的對話——被否決過的做法、某段程式為什麼那樣寫、
做到哪一步，都可能被漏掉或記錯。繼續之前**先重讀檔案，不要憑摘要接著做**：

1. \`SPEC.md\`（若存在）：看勾選狀態，\`- [ ]\` 才是還沒做的。
2. \`git log --oneline -20\` 與 \`git status\`：實際做到哪、有沒有做到一半沒 commit 的改動。
3. \`docs/DECISIONS.md\` 最後幾條（若存在）：前面做過的取捨，不要推翻它們。

摘要和檔案對不上時，**以檔案為準**。"
fi

jq -n --arg c "$base" \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $c}}' >&3
exit 0
