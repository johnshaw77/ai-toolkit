# CLAUDE.md — {{name}}

{{description}}

## 先讀這段

- 這是 `uv` 專案，**所有指令都用 `uv run` 開頭**，不要 `pip install`，
  也不要手動 activate 虛擬環境。
- Python {{python_version}}。
- 排版與檢查一律 `ruff`（line-length 100，規則 `E,F,I,UP,B,SIM`）。
  改完程式跑 `uv run ruff check .`，零錯誤才算完。

## 結構約定

| 放什麼 | 放哪 |
|---|---|
| 套件程式碼 | `src/{{name}}/` |
| 一次性或維運腳本 | `scripts/` |
| 不含秘密的設定 | `config/settings.yaml`（進版控） |
| 秘密 | `.env`（**不進版控**，改了記得同步 `.env.example`） |
| 測試 | `tests/`，檔名 `test_*.py` |

新增設定項目時，`config/settings.yaml`、`.env.example`、
`src/{{name}}/config.py` 三個地方要一起改，不要只改一處。

## 驗證的定義

```bash
uv run pytest        # 全綠
uv run ruff check .  # 零錯誤
uv run {{name}}      # 真的跑起來，不是只有 type check
```

## 還沒決定的事

功能規格還沒談。先 `/unattended:spec` 產出 `SPEC.md`，再開始寫。
