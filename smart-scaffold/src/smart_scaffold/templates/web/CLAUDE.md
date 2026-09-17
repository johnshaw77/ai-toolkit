# CLAUDE.md — {{name}}

{{description}}

## 先讀這段

- `uv` 專案，**所有指令 `uv run` 開頭**，不要 `pip install`。
- Python {{python_version}}、ruff（line-length 100、規則 `E,F,I,UP,B,C4,SIM`）。
- **零 Node**。前端是 Jinja2 + 原生 JS + 手寫 CSS，沒有建置步驟。
  不要因為「這樣比較快」就引入 npm、打包工具或前端框架——那會推翻這個專案
  最核心的取捨。真的需要那種東西，代表該換成 `app` preset。

## 四件不要重複發明的事

1. **分頁格式**：清單一律回 `{items, total, page, page_size}`，查詢參數一律
   `page` / `page_size` / `sort`。
2. **錯誤格式**：路由裡**不要丟 `HTTPException`**，丟 `errors.py` 的 `AppError`
   子類。同一個錯誤在 `/api/` 底下回 JSON，在頁面回導向——這個分工寫在
   `api.py` 的 `register_handlers()`。
3. **驗證**：集中在 service 層的 `validate()`，不要散在路由裡。
   錯誤訊息要帶欄位名，前端才能直接顯示。
4. **前端工具**：`static/app.js` 已經有 `api()`、`toast()`、`confirmAction()`、
   `escapeHtml()`。不要各頁自己再寫一份 fetch 包裝或錯誤解析。

## 分層

| 放什麼 | 放哪 |
|---|---|
| HTTP 轉換（只做轉換） | `api.py` |
| 業務邏輯與驗證 | `items.py` / `users.py` |
| 連線與建表 | `db.py` |
| 頁面 | `templates/`，共用外殼在 `base.html` |
| 樣式與行為 | `static/` |

所有 service 函式都吃 `sqlite3.Connection`，**交易邊界由呼叫端決定**。

## 三個容易踩的雷

1. **Jinja 的插值一律寫成 `{{ 變數 }}`（大括號裡有空白）。** smart-scaffold 的
   佔位符是沒有空白的那種，兩者靠空白分辨——寫成沒空白的會在生成新專案時被
   當成變數替換掉。
2. **sqlite 的外鍵預設是關的。** 每條連線都要 `PRAGMA foreign_keys = ON`，
   這件事 `db.connect()` 已經做了，不要另外開連線繞過它。
3. **連線不能跨執行緒共用。** FastAPI 的同步端點跑在 threadpool 上，所以是
   每個請求一條連線（`api.get_db`），不要圖方便開全域連線。

## 測試檔名不能重複

`tests/` 底下沒有 `__init__.py`，pytest 用**檔名**當模組名。所以
`tests/test_foo.py` 與 `tests/e2e/test_foo.py` 會直接撞在一起收不了測試
（錯誤訊息是 `import file mismatch`）。e2e 那邊的檔名習慣加 `_ui` 結尾。

## 驗證的定義

```bash
make check   # lint + 單元/API 測試 + e2e
```

光是單元測試綠不算數。**動到畫面就一定要跑 `make e2e`**——
`tests/e2e/test_flow.py` 有一條會走過流程並斷言 console 沒有任何 error 或
warning，靜態檔路徑打錯、JS 語法錯誤這類問題只有它抓得到。

## 還沒決定的事

`items` 是刻意寫得很中性的範例領域。開始做真功能時把它整組換掉：
`items.py`、`templates/items.html`、`static/items.js`，以及 `api.py` 裡
對應的那一段。
