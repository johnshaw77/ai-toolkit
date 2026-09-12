# 驗證紀錄

追加式。每輪寫下**實際看到什麼**，不是「應該可以了」。

---

## 2026-09-12　第一輪：問答引擎 + py preset

環境：macOS（darwin 25.5.0）、uv 0.11.6、git 2.x、docker 有在跑。

### 1. 單元測試與 lint（smart-scaffold 自己）

```
$ uv run pytest -q
81 passed in 0.34s

$ uv run ruff check .
All checks passed!
```

F1–F4 的測試案例數（`pytest --collect-only` 實際數出來的）：
`test_questions.py` 26 + `test_ports.py` 11 + `test_render.py` 14 +
`test_cli.py` 12 = **63 個**，超過 SPEC 要求的 25。
另有 `test_postactions.py` 11、`test_presets.py` 7，合計 81。

### 2. 旗標模式：照 SPEC 的步驟開一個真專案

```
$ uv run smart-scaffold py --name demo_tool --path /tmp/scaffold-check/demo_tool
✓ 已產生 15 個檔案於 /private/tmp/scaffold-check/demo_tool
→ 安裝依賴中（uv sync --extra dev）…
✓ 依賴已安裝（uv sync --extra dev）
✓ 已建立 git repo（分支 main）
✓ 已產生第一顆 commit

下一步：

  cd /private/tmp/scaffold-check/demo_tool
  uv run pytest
  uv run ruff check .

接著在那個資料夾裡開一個 Claude Code session：

  /unattended:spec           # 把第一輪要做的東西談成 SPEC.md
  /unattended:mode 依 SPEC.md 完成全部功能
```

進去驗：

```
$ uv sync --extra dev && uv run pytest && uv run ruff check .
Checked 9 packages in 1ms
8 passed in 0.20s
All checks passed!

$ git log -1 --pretty=%s
建立 demo_tool 專案骨架            # 中文，且不含 "Initial commit"

$ git branch --show-current
main

$ grep -r '{{' . --exclude-dir=.git --exclude-dir=.venv
（無輸出，離開碼 1）
```

其他實地檢查：

```
$ git status --porcelain
（空的——.venv/ 與 .env 都沒混進去）

$ git ls-files
.editorconfig / .env.example / .gitignore / .python-version / CLAUDE.md /
Makefile / README.md / config/settings.yaml / pyproject.toml / scripts/run.py /
src/demo_tool/{__init__,__main__,config}.py / tests/{test_config,test_smoke}.py /
uv.lock
（有 .env.example，沒有 .env）

$ ls -l scripts/run.py
-rwxr-xr-x    # 模板裡是 755，權限有保留

$ grep -n MAKE Makefile
26:	$(MAKE) lint
27:	$(MAKE) test    # $ 一字不變，沒有被當成佔位符

$ uv run demo_tool
demo_tool：demo_tool 專案
  服務埠    8002
  log 等級  INFO
```

### 3. 互動模式：每一題都按預設值走一次

用 pty 驅動（`isatty()` 必須為真才會進互動分支），第一題輸入名稱，其餘全按 Enter：

```
專案名稱（同時是 Python 套件名）: demo_interactive
一句話描述這個專案 [demo_interactive 專案]:
要建在哪裡 [~/Desktop/@SideProjects/demo_interactive]:
Python 版本 (3.12/3.13) [3.12]:
要在 config/settings.yaml 裡保留服務埠設定嗎 [Y/n]:
服務埠 [8002]:
生完之後要幫你跑 uv sync 裝依賴嗎 [Y/n]:
要 git init 並產生第一顆 commit 嗎 [Y/n]:
✓ 已產生 15 個檔案於 /Users/johnshaw77/Desktop/@SideProjects/demo_interactive
✓ 依賴已安裝 / ✓ 已建立 git repo（分支 main）/ ✓ 已產生第一顆 commit
[離開碼 0]
```

看到的：八題依序問完，沒有一題卡住；`{name}` 插值有生效（描述與路徑的預設值都
帶入了剛輸入的名稱）；單選題把選項列出來；布林題顯示 `[Y/n]`。生成後
`uv run pytest` 8 passed、`uv run ruff check .` 零錯誤、`git log -1 --pretty=%s`
是「建立 demo_interactive 專案骨架」。驗完已刪除這個示範專案。

### 4. 預設埠號是活的（不是寫死的 8000）

```
$ uv run python -c "...ports..."
docker 已發布的埠: [80, 3011, 3021, 5173, 5273, 5432, 5433, 5442, 5532, 6479,
                    7001, 8000, 8001, 8025, 8081, 8100, 8110, 8125, 8180, 8210,
                    9002, 9003, 9010, 9020, 9100, 9101, 9210, 9211, 13307]
  8000: bind 被佔用
  8001: bind 被佔用
  8002: bind 可用
建議: 8002
```

兩個來源都有作用：`docker ps` 認得 8000/8001，實際 bind 也確認被佔用，
所以建議 8002——跟互動模式看到的預設值一致。

docker 缺席的降級路徑用假指令驗過（`test_docker_不存在只是少一個來源`、
`test_docker_指令失敗只是少一個來源`、`test_docker_逾時只是少一個來源`），
三種情況都只是少一個來源，流程照樣給得出埠。

### 5. 踩到並修掉的真問題

**模板的行寬會隨專案名稱與描述長度膨脹。** `demo_tool` 過得了 ruff，
`demo_interactive` 就爆了 `E501`；再用 40 字的名稱加 60 格寬的中文描述去壓，
一次爆三行。修法是把模板裡會膨脹的那幾行拆開，並對名稱/描述加長度上限
（描述用東亞顯示寬度計算，因為 ruff 量的是顯示寬度）。

修完的壓力測試：

```
$ uv run smart-scaffold py --name dddddddddddddddddddddddddddddddddddddddd \
    --description "這是一個很長的描述這是一個很長的描述這是一個很長的描述啊啊啊" \
    --path /tmp/scaffold-check/long --no-install --no-git
✓ 已產生 15 個檔案

$ cd /tmp/scaffold-check/long && ruff check .
All checks passed!
```

**`lstrip("./")` 把 `.venv/` 啃成 `venv`。** commit 前的安全檢查因此漏掉最該擋的
東西；由 `test_venv_沒被_gitignore_擋住時不_commit` 抓到，改成明確的前綴處理。
