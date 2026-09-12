# CLAUDE.md — {{name}}

{{description}}

## 先讀這段

- 前後端**分開安裝依賴**：後端在 `backend/`（uv），前端在 `frontend/`（npm）。
  根目錄的 `Makefile` 幫你 cd 好了，`make help` 看有哪些指令。
- 後端所有指令都 `uv run` 開頭，不要 `pip install`。
- 改完就要驗：`make check`（後端 ruff + pytest，前端 eslint + build）。

## 不要重複發明的四件事

1. **分頁格式**：清單端點一律回 `Page[T]` = `{items, total, page, page_size}`，
   查詢參數一律 `page` / `page_size` / `sort`。前端的 `ProTable` 就是照這個接的。
2. **錯誤格式**：router 裡**不要丟 `HTTPException`**，丟 `app/core/errors.py` 的
   `AppError` 子類（`NotFoundError` / `ConflictError` / `ForbiddenError`…），
   回應才會是統一的 `{code, message, detail}`。
3. **查詢邏輯**：軟刪除過濾、排序白名單、分頁計數都在 `BaseRepository` 裡，
   不要在端點裡自己寫 `limit/offset`。
4. **前端錯誤訊息**：用 `errorMessage(error)`，不要各頁自己解析後端回應。

## 加一個功能的標準路徑

後端：`models/` 建表 → `schemas/` 定形狀 → `repositories/` 寫查詢 →
`api/v1/endpoints/` 加端點 → `api/v1/router.py` 掛上去 → `tests/` 補測試 →
`uv run alembic revision --autogenerate -m "繁體中文說明"`。

前端：`api/` 加呼叫 → `views/` 加頁面 → `router/index.ts` 加路由 →
`layouts/menu.ts` 加選單。

## 時間與時區

一律存帶時區的 UTC，用 `app/core/clock.py` 的 `utcnow()`。
**從資料庫讀出來的時間在比較之前要先過 `as_utc()`** —— sqlite 沒有原生時區型別，
讀回來是 naive，直接跟 aware 的時間比較會 TypeError。

對外的時間欄位用 `schemas/common.py` 的 `UTCDateTime`，不要直接用 `datetime`，
否則 JSON 會少掉時區、前端無從判斷要不要換算。

**不要用 SQL 的 `func.now()` 當 `onupdate`**：SQLAlchemy 會在 UPDATE 之後回頭
再查一次資料庫，async 情境下直接炸 `MissingGreenlet`。用 Python 端的 `utcnow`。

## 驗證的定義

```bash
cd backend && uv run pytest && uv run ruff check .
cd frontend && npm run lint && npm run type-check && npm test && npm run build
```

光是 type-check 過不算數。**動到 UI 就要真的開瀏覽器走一次流程**，
console 不可以有任何 error 或 warning。

## 還沒決定的事

`Item` 是刻意寫得很中性的範例領域，用來撐起列表、分頁、搜尋、CRUD 的骨架。
開始做真功能時把它整組換掉（後端 model/schema/repository/endpoint + 前端
`ItemsView` + `api/items.ts`）。
