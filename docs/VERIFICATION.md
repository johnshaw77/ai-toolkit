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

---

## 2026-09-12　第二輪：app preset（FastAPI + Vue3 + antd）

環境：macOS、uv 0.11.6、Node v22.21.0、npm 10.9.4。

### 1. smart-scaffold 自己

```
$ uv run pytest -q
89 passed in 0.67s

$ uv run ruff check .
All checks passed!
```

### 2. 生成一個真專案

```
$ uv run smart-scaffold app --name demo_app --title "示範管理系統" \
    --path /tmp/app-check/demo_app --backend-port 8002 --frontend-port 5174
✓ 已產生 81 個檔案

$ grep -rno '{{[A-Za-z_][A-Za-z0-9_]*}}' /tmp/app-check/demo_app
（無輸出——沒有殘留佔位符，Vue 的 {{ expr }} 插值則完整保留）
```

### 3. 後端：真的把服務跑起來，實際打 endpoint

```
$ cd backend && cp .env.example .env && uv sync --extra dev
$ uv run ruff check .        → All checks passed!
$ uv run pytest -q           → 20 passed
$ uv run alembic upgrade head
INFO  [alembic.runtime.migration] Running upgrade  -> 0001, 建立初始資料表：users / refresh_tokens / items
$ uv run python -m app.seed
已建立管理員 admin@example.com / 初始資料建立完成。
$ uv run uvicorn app.main:app --port 8002
INFO:     Application startup complete.
```

正常路徑與錯誤路徑都打過：

```
GET  /api/v1/health            → 200 {"status":"ok"}
GET  /api/v1/health/db         → 200 {"status":"ok","database":"ok"}
POST /api/v1/auth/login（正確）  → 200 access_token / refresh_token / user
POST /api/v1/auth/login（密碼錯）→ 401 {"code":"UNAUTHORIZED","message":"帳號或密碼不正確"}
POST /api/v1/auth/login（缺欄位）→ 422 {"code":"VALIDATION_ERROR",...,"detail":[{"field":"password","message":"Field required"}]}
GET  /api/v1/items（沒帶 token）→ 401 {"code":"UNAUTHORIZED","message":"請先登入"}
GET  /api/v1/items（帶 token）  → 200 {"items":[...],"total":3,"page":1,"page_size":20}
POST /api/v1/items             → 201 {"id":"bde85694-...","code":"B-100",...}
POST /api/v1/items（代號重複）  → 409 {"code":"CONFLICT","message":"代號 B-100 已經有人用了"}
GET  /api/v1/items/<不存在的 id> → 404 {"code":"NOT_FOUND","message":"找不到這筆資料"}
```

服務 log 掃過：`grep -nE "Traceback|Exception|ERROR|CRITICAL" api.log` 無輸出。

### 4. 前端：裝、檢查、建置

```
$ npm install && npm run lint        → 無輸出（過）
$ npm run type-check                 → 無輸出（過）
$ npm test                           → 2 files / 6 tests passed
$ npm run build                      → ✓ built in 1.69s
```

### 5. 瀏覽器實際走一次（這一條抓到最重要的 bug）

用 Chrome 開 `http://localhost:5174`，先確認 `<title>` 是「登入 - 示範管理系統」
——確定連到的是這個專案而不是別人的服務。

走過的流程與看到的結果：

| 步驟 | 看到什麼 |
|---|---|
| 開首頁 | 未登入被導向 `/login?next=/`，路由守衛有效 |
| 登入 admin@example.com / admin1234 | 進到首頁，統計卡顯示「系統管理員 / ADMIN / 資料筆數 3」——資料是真的從 API 來的 |
| 點「資料列表」 | ProTable 顯示 3 筆、狀態標籤有顏色、分頁顯示「共 3 筆」 |
| 搜尋 `A-001` | 剩 1 筆，`GET /items?keyword=A-001` 出現在後端 log |
| 新增 `C-999`／「瀏覽器實測新增的項目」 | modal 正常、toast 顯示「已新增」、`POST /items → 201` |
| 按「重置」 | 搜尋條件清空，回到「共 4 筆」，新增的那筆在列表最上面 |
| 切亮色模式 | 整個外殼與 antd 元件同步換色 |
| 點「使用者」 | 管理員專屬頁顯示 admin@example.com |
| 開一個不存在的網址 | 404 頁，而且外殼還在 |
| 登出 | 導回登入頁 |

**console 全程零 error、零 warning**（只有 Vite 自己的 `[vite] connected` DEBUG 訊息）。
截圖存在 `docs/screenshots/app-preset-items.jpg`。

### 6. 踩到並修掉的真問題

**前端所有 antd 元件都沒註冊。** `main.ts` 漏了 `app.use(Antd)`。登入頁只剩
「記住我 登入」兩行文字，輸入框整個不見。**`npm run lint`、`type-check`、`test`、
`build` 全部綠燈，一個都沒抓到**——只有真的開瀏覽器才看得見。console 當時噴了
9 條 `[Vue warn]: Failed to resolve component: a-xxx`。這一條就是「動到 UI 就要
開瀏覽器」這個規定存在的理由。

**後端四個 bug**（詳見該顆 commit）：`onupdate` 用 SQL 的 `func.now()` 在 async
下炸 `MissingGreenlet`、sqlite 的 naive datetime 跟 aware 比較炸 TypeError、
帳號不存在時的 dummy 雜湊驗證沒接例外、開發用 JWT 金鑰太短被 pyjwt 警告。

**工具鏈兩個**：vitest 2 綁的是 Vite 5，跟 Vite 6 型別打架（升到 vitest 3）；
`vite.config.ts` 的 `test` 區塊要從 `vitest/config` 匯入 `defineConfig` 才認得。

### 7. 渲染器的規則改了

Vue 的插值 `{{ user.name }}` 跟佔位符 `{{var}}` 撞車，渲染器會把它當成未定義的
變數而中止。改成「大括號裡不能有空白才算佔位符」，並補了兩個測試（`test_render.py`
的 `test_大括號裡有空白的就不是佔位符`、`test_同一個檔案裡可以同時有佔位符與_vue_插值`）。
py preset 重生一次確認沒被影響：15 個檔案、`pytest` 8 passed、`ruff` 零錯誤。

---

## 2026-09-12　第三輪：按需匯入、端對端測試、容器化

### 1. smart-scaffold 自己

```
$ uv run pytest -q          → 93 passed
$ uv run ruff check .       → All checks passed!
```

### 2. antd 按需匯入：打包量的前後對照

同一個專案，只改匯入方式：

| | 最大的 chunk | gzip |
|---|---|---|
| 之前（`app.use(Antd)`） | 1,591.71 kB | 498.68 kB |
| 之後（`unplugin-vue-components`） | 303.88 kB | 109.31 kB |

而且輸出從「一個大 chunk」變成照路由切開的十幾個小 chunk。

改完之後 `vue-tsc` 立刻報出一個原本看不到的錯：

```
src/components/ProTable.vue(35,8): error TS2740:
  Type '{ value: T[]; }' is missing the following properties from type 'any[]'
```

整包註冊時 `a-table` 沒有真正的型別，所以 `rows` 那個錯誤的斷言一直沒被發現。
改成 `ref([]) as Ref<T[]>` 之後 type-check 通過。

### 3. 端對端測試：12 個案例，實際跑過

```
$ npm run e2e
  ✓ 登入 › 未登入時會被導向登入頁，並記住原本要去的地方
  ✓ 登入 › 密碼錯誤會顯示錯誤訊息而且留在登入頁
  ✓ 登入 › 登入成功之後回到原本要去的頁面
  ✓ 登入 › 登出之後回到登入頁，而且不能再直接進去
  ✓ 資料列表 › 列表顯示種好的範例資料
  ✓ 資料列表 › 搜尋會縮小結果，重置會還原
  ✓ 資料列表 › 新增、編輯、刪除走完一圈
  ✓ 資料列表 › 代號重複會顯示後端回的錯誤訊息
  ✓ 後台外殼 › 走過每一頁，console 不可以有任何 error 或 warning
  ✓ 後台外殼 › 側邊欄可以在頁面之間切換
  ✓ 後台外殼 › 深色模式切換之後會記住
  ✓ 後台外殼 › 不存在的網址顯示 404，而且外殼還在
  12 passed (15.5s)
```

第一次跑時 1 個失敗——是測試 helper 的 race：`page.goto()` 在初次載入就 resolve，
**SPA 的路由守衛還沒把網址換掉**，這時候判斷 `page.url()` 會得到舊值。
helper 改成先 `waitForURL(/\/login/)` 再填表單。

### 4. 容器化：sqlite 版

```
$ docker compose up -d --build
$ docker compose ps
SERVICE   STATUS                    PORTS
api       Up 8 seconds (healthy)    0.0.0.0:8003->8000/tcp
web       Up 3 seconds (healthy)    0.0.0.0:5175->80/tcp

$ docker compose logs api
→ 套用資料庫 migration
INFO  [alembic.runtime.migration] Running upgrade  -> 0001, 建立初始資料表…
→ 建立初始資料（SEED_ON_START=1）
已建立管理員 admin@example.com
INFO:     Application startup complete.
```

打過的端點：

```
直接打 api（8003）：
  GET /api/v1/health      → 200 {"status":"ok"}
  GET /api/v1/health/db   → 200 {"status":"ok","database":"ok"}
經 nginx 轉發（5175）：
  GET /api/v1/health      → 200
  POST /api/v1/auth/login → 200（拿得到 token）
SPA fallback：
  GET /items              → 200，回的是 <title>示範管理系統</title> 的 index.html
```

瀏覽器實際開 `http://localhost:5175/items`（**正式建置版，不是 dev server**）：
被導向登入頁 → 登入 → 正確回到 `/items` → 列表顯示 3 筆。切到 `/users` 也正常。
console 沒有任何訊息。

埠對照：本機開發 8002 / 5174，容器版 8003 / 5175——兩邊同時跑不會撞。

### 5. 容器化：PostgreSQL 版

```
$ export COMPOSE_FILE=docker-compose.yml:docker-compose.postgres.yml
$ docker compose up -d --build
SERVICE   STATUS                    PORTS
api       Up 17 seconds (healthy)   0.0.0.0:8003->8000/tcp
db        Up 23 seconds (healthy)   0.0.0.0:5434->5432/tcp
web       Up 12 seconds (healthy)   0.0.0.0:5175->80/tcp

$ docker compose logs api
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Running upgrade  -> 0001, 建立初始資料表…

$ docker compose exec db psql -U app_pg_app -d pg_app -c "\dt"
 public | alembic_version | table | app_pg_app
 public | items           | table | app_pg_app
 public | refresh_tokens  | table | app_pg_app
 public | users           | table | app_pg_app

$ docker compose exec db psql -U app_pg_app -d pg_app -tAc "select version_num from alembic_version;"
0001

經 nginx：GET /api/v1/health/db → 200 {"status":"ok","database":"ok"}
          POST /auth/login（正確）→ 200、（密碼錯）→ 401
全部容器的 log 掃過 traceback/exception：無。
```

驗完用 `docker compose down` 停掉，並逐一指名刪掉這次測試建立的三個 volume
（`pg_app_db-data`、`pg_app_api-data`、`demo_app_api-data`），沒有用 `down -v`
掃整批。

### 6. 這一輪抓到的真問題

**PostgreSQL 不准角色名以 `pg_` 開頭。** 用 `--name pg_app` 測試時 db 容器
不斷重啟，log 裡是 `initdb: error: superuser name "pg_app" is disallowed`。
這種錯誤埋在容器 log 裡，不實際跑一次根本看不到。資料庫帳號現在會自動避開這個
前綴。

**選 sqlite 時不會問資料庫埠，疊加檔卻拿到寫死的 5432**——而這台機器上 5432
早就被別的服務佔用。現在沒問也照樣配一個沒被佔用的。

**e2e 測試把專案顯示名稱寫死成「示範管理系統」。** 那是我開發模板時用的名字；
換個 `--title` 生出來的專案，整組 e2e 第一條就紅。這個問題是**刻意用另一個名字
（`--title "回歸驗證系統"`）做回歸驗證**才現形的——一直用同一個名字測永遠看不到。

### 7. 兩個 preset 的完整回歸

```
py：  15 個檔案 → uv sync → 8 passed → ruff 零錯誤 → commit「建立 reg_py 專案骨架」
app： 94 個檔案 → 後端 uv sync + 前端 npm install → git init → commit
      backend:  20 passed / ruff 零錯誤
      frontend: eslint 過 / vue-tsc 過 / vitest 6 passed / build 過 / e2e 12 passed
      git status --porcelain 空的，node_modules、.venv、.env 都沒混進版控
```
