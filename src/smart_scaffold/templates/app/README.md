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
make check                   # lint + 後端測試 + 前端建置
```

## 換成 PostgreSQL

```bash
docker compose up -d db
docker compose ps            # 確認是 healthy
```

然後把 `backend/.env` 的 `DATABASE_URL` 改成：

```
postgresql+asyncpg://{{name}}:{{name}}_dev_pw@127.0.0.1:{{db_port}}/{{name}}
```

再跑一次 `cd backend && uv run alembic upgrade head`。`asyncpg` 已經在依賴裡，
不用再裝東西。

## 下一步

功能規格還沒談。先用 `/unattended:spec` 產出 `SPEC.md`，再開始寫。
