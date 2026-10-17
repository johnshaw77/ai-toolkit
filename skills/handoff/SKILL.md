---
name: handoff
description: 換機器或結束對話前，把目前開發進度寫成 HANDOFF.md 並 commit（私人專案直接提交到目前分支，公司專案切 wip/ 分支）（handoff）；或在新對話開始時讀 HANDOFF.md 接續工作（resume）。當使用者說「交接」「handoff」「換機器」「接續上次進度」「resume」時使用。
---

# Handoff：跨機器 / 跨對話交接

這個 Skill 有兩個模式。先依使用者的話判斷是 **handoff**（交出去）還是 **resume**（接起來）；不確定就問一句。

## 先判斷專案類型：私人還是公司

用 `git remote get-url origin` 看遠端網址：

- 網址含 `jnxstudio` 或 `johnshaw77` → **私人專案**（只有使用者一人）。
- 其他（或沒有遠端）→ **公司專案**（共用遠端）。

私人專案的清單就是上面這兩個字串；使用者有新的私人帳號再加在這裡。

| 動作 | 私人 | 公司 |
|---|---|---|
| 分支 | **不另開分支**，直接在目前分支（通常是 main）commit | 切出 `wip/` 分支再 commit |
| commit | 自動 | 自動 |
| push | 自動推目前分支，不用問 | 只推 `wip/` 分支，先列出檔案，**等使用者說可以**再推 |
| 發現疑似機密 | 停下來問 | 停下來問 |

私人專案只有使用者一人、deploy 也只是留紀念或分享，不需要 wip 分支的隔離，也免得忘記收尾。

任何情況都不要 force push、不要改寫歷史。公司專案不要 push 到 `wip/` 以外的分支。

---

## 模式 A：handoff（交出去）

目標：讓另一台機器上的全新對話，只靠 repo 就能無痛接手。

1. 執行 `git status --porcelain`、`git branch --show-current`、`git diff --stat`，掌握目前分支與未提交的變更。
2. 用 `date '+%Y-%m-%d %H:%M'` 取時間、機器名稱讀 `~/.claude/host-badge.json` 的 `label`（host-badge mod 設的，例如 `Macbook Pro`），沒有這個檔才用 `hostname -s`，**不要憑印象寫**。不要用 `scutil --get ComputerName` 或 `LocalHostName`：它們常含真實姓名，不該寫進 repo。
3. 回顧本次對話，在 repo 根目錄寫（或覆寫）`HANDOFF.md`，使用下方固定格式。內容要具體到檔案路徑與指令，不要寫「大致完成」這種模糊說法。
4. 決定分支：
   - 私人專案：不切分支，留在目前分支。
   - 公司專案：目前已經在 `wip/` 開頭的分支就直接用，不要再開新的；否則一律從目前位置切出 `wip/<主題>-<YYYYMMDD>`（不論原本在 main、develop 或別人也在用的 feature 分支）。
5. 挑要提交的檔案：
   - 先看 `git status --porcelain` 的清單，**不要直接 `git add -A`**。
   - 一律排除：`.env*`、`*.pem`、`*.key`、`id_rsa*`、`docs/transcripts/`，以及 `.gitignore` 已經擋掉的東西。
   - 用 `git diff` 與 `git diff --cached` 掃一次 `api[_-]key|secret|password|token|BEGIN.*PRIVATE KEY`；有命中就停下來問使用者，不要自己判斷是不是誤報。
   - 其餘用 `git add <檔案>` 逐一加入（`HANDOFF.md` 一定要在裡面）。
6. commit 訊息用繁體中文：`交接：<一句話描述>`（公司專案的 wip 分支用 `wip：交接 - <一句話描述>`）。技術名詞與識別字保留原文。
7. push：依上面的表格——私人直接 `git push`（新分支才加 `-u origin <分支>`），公司先問。沒有遠端就只 commit，並告訴使用者。
8. 回報：專案類型、分支名稱、commit hash、有沒有 push，以及另一台機器上該下的指令：

   ```bash
   # 私人（目前分支，通常是 main）
   git pull --ff-only
   # 公司（wip 分支）
   git fetch --all --prune && git checkout <wip 分支> && git pull --ff-only
   ```

### HANDOFF.md 格式

```markdown
# HANDOFF（<日期時間>，來自 <機器名稱>）

## 目標
<這個任務最終要達成什麼>

## 目前進度
- 已完成：...
- 進行中：...（做到哪個檔案、哪個函式）

## 已做的決策與原因
- 決策 → 原因（這是最容易遺失、最重要的一段）
- 專案若已有 docs/DECISIONS.md，這裡只放連結與一句話，不要複寫一份

## 試過但失敗的做法
- 做法 → 為什麼不行

## 下一步
1. ...
2. ...

## 風險與未提交內容
- 有問題或尚未驗證的變更、相關檔案路徑
- 最後一次跑的測試／型別檢查：指令與結果（綠或紅、哪幾個失敗）；沒跑過就寫「沒跑過」

## 環境注意事項
- 需要啟動的服務、埠號、環境變數、尚未跑的 migration、測試指令
- repo 帶不走、要先用 media-sync 等工具同步的檔案（媒體、素材、gitignored 但需要的檔案），寫出是哪些、放哪裡
```

---

## 模式 B：resume（接起來）

目標：快速恢復脈絡，並在動手前先確認理解正確。

1. 找到交接的分支：
   - 私人專案：`HANDOFF.md` 就在目前分支上，先 `git pull --ff-only` 拿最新的；失敗（本機與遠端分歧）就停下來告知，不要自己 merge 或 reset。
   - 公司專案：`HANDOFF.md` 在 `wip/` 分支上，新機器預設不在那裡。目前分支已經有 `HANDOFF.md` → 直接用。否則 `git fetch --all --prune`，再用 `git branch -r --sort=-committerdate --format='%(refname:short) %(committerdate:relative)' | grep 'wip/'` 列出最近的 `wip/` 分支。只有一個明顯最新的就用它；有多個接近的就列給使用者選。
   - 公司專案要切換分支前先看 `git status`：本機有未提交變更就停下來問，不要硬切。
   - 公司專案切過去後 `git pull --ff-only`；失敗（本機與遠端分歧）就停下來告知，不要自己 merge 或 reset。
2. 確認 `HANDOFF.md` 存在；不存在就告知使用者，並改問他目前進度。
3. 讀 `HANDOFF.md`，再執行 `git status`、`git log --oneline -5`，核對：目前分支是否與文件一致、有沒有文件沒提到的未提交變更。「環境注意事項」裡要先同步的檔案（media-sync 等）也要確認這台有了。
4. 用 3～5 句話回報：「我理解的目標、目前進度、下一步」，並指出任何不一致之處。
5. **等使用者確認後才開始修改程式碼。**
6. 完成後的收尾：問使用者要不要把 `HANDOFF.md` 刪掉或更新。公司專案要特別提醒：**合併回主線前要先刪掉 `HANDOFF.md`**，並在合併後刪除 `wip/` 分支，避免過期的交接文件進到主線。私人專案沒有這個問題，但過期的 `HANDOFF.md` 還是會誤導下一次對話，順手更新或刪掉。

---

## 原則

- 長期不變的專案規則屬於 `CLAUDE.md`，不要寫進 `HANDOFF.md`。
- 不要在 `HANDOFF.md` 放密碼、token、連線字串等機密。
- `HANDOFF.md` 是暫時的：一次交接用完就刪或更新，不要累積成歷史（歷史交給 git log）。
