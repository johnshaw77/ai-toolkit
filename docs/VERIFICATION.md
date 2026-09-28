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

