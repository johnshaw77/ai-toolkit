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

