# {{name}}

{{description}}

## 專案概述

一個伺服器端渲染的網頁工具：FastAPI 出頁面與 JSON API，前端是 Jinja2 模板加
原生 JavaScript，**完全不需要 Node 或 npm**。資料庫是 sqlite，用標準庫的
`sqlite3`，沒有 ORM。

適合的情境是「一個人或一個小團隊要用的內部工具」——裝好 Python 就能跑，
沒有前端建置步驟，改完存檔重新整理就看得到。

需要 Vue / antd 那種豐富互動的後台，用 smart-scaffold 的 `app` preset。

## 核心功能

- **登入**：cookie session（HttpOnly + SameSite=Lax）、argon2 密碼雜湊。
- **統一分頁**：清單一律回 `{items, total, page, page_size}`。
- **統一錯誤格式**：`{code, message}`；同一個錯誤在 API 是 JSON，在頁面是導向。
- **列表頁**：搜尋、狀態篩選、排序、分頁、新增／編輯／刪除，全部走 fetch。
- **深色模式**：CSS 變數兩套配色，跟隨系統並記住使用者的選擇。
- **端對端測試**：pytest-playwright，含一條「console 不可以有 error 或 warning」。

## 技術棧

| 項目 | 選用 |
|---|---|
| 語言 | Python {{python_version}}（`uv` 管理） |
| 後端 | FastAPI + uvicorn |
| 前端 | Jinja2 + 原生 JS（ES module）+ 手寫 CSS，**零 Node** |
| 資料庫 | sqlite（stdlib `sqlite3`，不用 ORM） |
| 測試 | pytest（單元／API）+ pytest-playwright（e2e） |
| Lint | ruff（line-length 100） |

## 專案結構

```
{{name}}/
├── config/settings.yaml       # 不含秘密的設定，進版控
├── scripts/run.py             # 手動跑一次的 entry point
├── src/{{name}}/
│   ├── api.py                 # FastAPI：頁面路由 + JSON API
│   ├── auth.py                # 密碼雜湊、session 簽章
│   ├── config.py              # 設定載入（.env 蓋過 settings.yaml）
│   ├── db.py                  # 連線管理與建表
│   ├── errors.py              # 統一錯誤型別
│   ├── items.py               # 範例領域的業務邏輯
│   ├── users.py
│   ├── templates/             # Jinja2
│   └── static/                # CSS 與原生 JS
├── tests/                     # 單元與 API 測試
│   └── e2e/                   # 端對端（預設不跑，要 make e2e）
├── Dockerfile
└── Makefile                   # make help 看有哪些指令
```

## 快速開始

```bash
make install                 # 建虛擬環境並裝依賴
cp .env.example .env
make init                    # 建資料表 + 建管理員與範例資料
make run                     # http://127.0.0.1:{{port}}
```

用 `admin@example.com` / `admin1234` 登入。API 文件在
<http://127.0.0.1:{{port}}/api/docs>。

開發時用 `make dev`，改檔案會自動重載。

## 驗證

```bash
make test                    # 單元與 API 測試
make e2e-install             # 第一次跑 e2e 之前要先裝瀏覽器
make e2e                     # 端對端
make check                   # 以上全部加 lint
```

`make test` 預設**不含** e2e（它要開瀏覽器，比較慢）。

## 用容器跑

```bash
make up                      # docker compose up -d --build
make ps                      # 確認是 running/healthy
make logs
make down                    # 停掉（不會刪 volume）
```

開 <http://localhost:{{container_port}}>。容器版的埠跟本機開發**刻意錯開**，
兩邊可以同時跑。sqlite 檔放在掛載的 volume 上，容器重建資料不會消失。

要換容器對外的埠就設 `HOST_PORT`（不是 `.env` 裡的 `APP_PORT`——那是容器**內部**
的埠，而且 compose 會讀同一個 `.env`，改錯了會讓容器跟 `make run` 撞在一起）。

> `docker compose down -v` 會連 volume 一起刪掉。只是要停掉服務的話用 `make down`。

## 下一步

功能規格還沒談。先用 `/unattended:spec` 產出 `SPEC.md`，再開始寫。
