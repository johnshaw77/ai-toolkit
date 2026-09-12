# {{name}}

{{description}}

## 專案概述

前後端分離的全端專案，由 smart-scaffold 生成。後端是 FastAPI + SQLAlchemy 2.0
（async）+ alembic，前端是 Vue 3 + Ant Design Vue + Vite。兩邊各自獨立安裝依賴，
但放在同一個 repo 裡，開發時用根目錄的 `make` 指令操作。

登入、分頁、統一錯誤格式、深色模式這些每個後台都要做一遍的東西已經做完了。
現在要做的是把範例領域（`Item`）換成你自己的。

## 核心功能

- **認證**：argon2 密碼雜湊、JWT access token、refresh token 輪替與重用偵測。
- **統一分頁**：所有清單端點回 `{items, total, page, page_size}`，前端 `ProTable` 直接接。
- **統一錯誤格式**：`{code, message, detail}`，前端 `errorMessage()` 只在一處解析。
- **後台殼**：側邊欄 + 頂欄 + 深色模式 + 路由守衛（未登入導回登入頁）。
- **軟刪除**：刪除是標記 `deleted_at`，資料還在。

## 技術棧

| 層 | 選用 |
|---|---|
| 後端 | Python {{python_version}} + FastAPI + SQLAlchemy 2.0 (async) + alembic |
| 資料庫 | 預設 sqlite（開箱即跑）；要換 PostgreSQL 見下方 |
| 前端 | Vue 3 + TypeScript + Ant Design Vue 4 + Vite 6 |
| 套件管理 | 後端 uv、前端 npm |
| 測試 | 後端 pytest、前端 vitest |
| Lint | 後端 ruff、前端 eslint + prettier |

## 專案結構

```
{{name}}/
├── backend/
│   ├── alembic/             # 資料庫 migration
│   ├── app/
│   │   ├── api/v1/endpoints/  # 端點，一個模組一個檔
│   │   ├── core/            # 設定、錯誤、JWT、雜湊、時間
│   │   ├── db/              # ORM 基底與 session
│   │   ├── models/          # 資料表
│   │   ├── repositories/    # 查詢邏輯（分頁、排序、軟刪除都在基底裡）
│   │   ├── schemas/         # 進出的資料形狀
│   │   ├── services/        # 跨資料表的商業邏輯
│   │   └── main.py
│   └── tests/
├── frontend/
│   └── src/
│       ├── api/             # axios 封裝與各模組的呼叫
│       ├── components/      # ProTable 等可重用元件
│       ├── layouts/         # 後台殼與選單
│       ├── router/          # 路由與守衛
│       ├── stores/          # Pinia
│       └── views/           # 頁面
├── docker-compose.yml       # 只有選 PostgreSQL 時才需要
└── Makefile                 # make help 看有哪些指令
```

## 快速開始

```bash
make install                 # 裝前後端依賴

cd backend
cp .env.example .env
uv run alembic upgrade head  # 建資料表
uv run python -m app.seed    # 建管理員與範例資料
cd ..

make api                     # 終端機 A：後端 http://127.0.0.1:{{backend_port}}
make web                     # 終端機 B：前端 http://localhost:{{frontend_port}}
```

開 <http://localhost:{{frontend_port}}> 用 `admin@example.com` / `admin1234` 登入。
API 文件在 <http://127.0.0.1:{{backend_port}}/api/v1/docs>。

驗證：

```bash
make check                   # lint + 測試 + 前端建置 + e2e
```

端對端測試第一次跑之前要先裝瀏覽器：

```bash
cd frontend && npm run e2e:install
make e2e                     # playwright 會自己把前後端跑起來
```

e2e 用自己的資料庫檔（`backend/e2e.db`），每次跑都重建，不會動到你開發中的資料。

## 用容器跑整套

```bash
make up                      # = docker compose up -d --build
make ps                      # 每個服務都要是 running/healthy
make logs                    # 跟著看 log
make down                    # 停掉（不會刪 volume）
```

開 <http://localhost:{{web_container_port}}>。容器版的埠**刻意跟本機開發錯開**
（API {{api_container_port}}、網頁 {{web_container_port}}），所以 `make api` /
`make web` 跟容器可以同時跑。

容器啟動時會自動套用 migration；`SEED_ON_START=1`（預設）還會建好管理員與範例
資料，上線環境請設成 `0`。

## 換成 PostgreSQL

設一次環境變數，之後所有 `docker compose` 與 `make up` 都會自動吃到疊加檔：

```bash
export COMPOSE_FILE=docker-compose.yml:docker-compose.postgres.yml
make up
```

要在本機（不進容器）連它的話，把 `backend/.env` 的 `DATABASE_URL` 改成：

```
postgresql+asyncpg://{{db_user}}:{{db_password}}@127.0.0.1:{{db_port}}/{{name}}
```

再跑一次 `cd backend && uv run alembic upgrade head`。`asyncpg` 已經在依賴裡，
不用再裝東西。

> `docker compose down -v` 會連 volume 一起刪掉，資料庫裡的東西就沒了。
> 只是要停掉服務的話用 `make down`。

## 下一步

功能規格還沒談。先用 `/unattended:spec` 產出 `SPEC.md`，再開始寫。
