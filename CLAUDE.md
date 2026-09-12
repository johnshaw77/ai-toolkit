# CLAUDE.md — smart-scaffold

給未來 session 的導覽。動手前先讀這頁。

## 這是什麼

一支開新專案的腳手架 CLI。逐步問答問完該問的 → 渲染模板 → 裝依賴 → `git init`
→ 產生第一顆繁體中文 commit。

## 不可違反的約束

- **執行期零第三方依賴**，只用標準庫。`pytest` / `ruff` 只放在 `dev` extra。
  理由：這支工具要能在任何一台剛裝好的機器上跑。
- Python 3.12，用 `uv` 管理。
- **跨平台**。Windows 沒有 `lsof`、可能沒有 `docker`；Python 在 Windows 叫
  `python` 不是 `python3`。**缺任何外部指令都要降級，不要拋例外。**

## 程式碼在哪

| 路徑 | 負責 |
|---|---|
| `src/smart_scaffold/questions.py` | 問題定義引擎（`Question` / `ask_all`），與顯示無關 |
| `src/smart_scaffold/presets.py` | 每個 preset 問哪些題——**新增問題只改這裡** |
| `src/smart_scaffold/ports.py` | 埠號偵測（bind 測試 + `docker ps`） |
| `src/smart_scaffold/render.py` | 模板渲染（`{{var}}`，含檔名） |
| `src/smart_scaffold/postactions.py` | 裝依賴 / git init / 第一顆 commit / 下一步 |
| `src/smart_scaffold/cli.py` | argparse 由問題定義**自動產生**，不要手寫第二份清單 |
| `src/smart_scaffold/templates/<preset>/` | 模板本體 |

## 兩件最容易做錯的事

1. **佔位符是 `{{var}}`，不是 `$var`。** 模板裡有 Makefile 與 shell，`$` 會衝突，
   所以不准用 `string.Template`。
2. **新增一題只改 `presets.py` 一處**，CLI 旗標與 `--help` 會自己長出來。
   在別處再寫一份清單就是 bug。

## 開發

```bash
uv sync --extra dev
uv run pytest
uv run ruff check .
```

模板資料夾被 ruff 排除（裡面不是合法 Python），改模板後靠「實際生一個專案出來」驗證。
