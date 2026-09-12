# smart-scaffold

一支開新專案的腳手架工具。逐步問答問完該問的，然後生成骨架、裝依賴、`git init`
並產生第一顆繁體中文 commit。

## 為什麼要有它

現有專案都是「開工之後才看到生出來的結構，然後妥協」，所以每個專案長得都不一樣。
把結構決定的時機提前到**什麼都還沒寫的時候**，改的成本是零。

## 安裝

執行期**零第三方依賴**，只用標準庫，所以在任何一台裝好 Python 3.12 的機器上都跑得動。

```bash
git clone <這個 repo> && cd smart-scaffold
uv sync --extra dev
```

不想裝也可以直接跑：

```bash
python3 -m smart_scaffold py
```

## 怎麼用

互動模式——問完每一題就開始生：

```bash
uv run smart-scaffold py
```

旗標模式——全部給齊就完全不用互動（CI 或腳本裡用這個）：

```bash
uv run smart-scaffold py \
  --name demo_tool \
  --path ~/Desktop/@SideProjects/demo_tool \
  --port 8123
```

`--help` 會列出每一題的提示文字與預設值：

```bash
uv run smart-scaffold py --help
```

常用旗標：

| 旗標 | 作用 |
|---|---|
| `--yes` / `-y` | 不互動，沒給的項目一律用預設值 |
| `--no-install` | 跳過 `uv sync` |
| `--no-git` | 跳過 `git init` 與第一顆 commit |

生成完會做三件事：`uv sync --extra dev` → `git init -b main` → 第一顆 commit。
**裝依賴失敗不會中止**，只會在總結裡叫你自己補跑。

埠號是算出來的：從 8000 往後找第一個沒被佔用的埠，判定來源是實際 bind 測試加上
`docker ps` 已發布的埠。機器上沒有 docker 只是少一個來源，不會出錯。

## 模板放在哪

```
src/smart_scaffold/templates/
├── py/     # Python 專案：uv + src/ 套件分層 + scripts/ + config/
└── app/    # FastAPI + Vue3 + antd（下一輪才做，目前會擋下來）
```

模板裡的佔位符是 `{{var}}`，**檔名與資料夾名也會被替換**（例：
`src/{{name}}/__init__.py`）。刻意不用 `$var`，因為模板裡有 Makefile 與 shell，
`$(MAKE)` 和 `$$` 不能被動到。

## 怎麼新增一個 preset

1. 在 `src/smart_scaffold/templates/<key>/` 放模板檔案。
2. 在 `src/smart_scaffold/presets.py` 的 `PRESETS` 加一筆 `Preset(...)`。

就這樣——CLI 子命令、旗標、`--help` 都會自己長出來。

**新增一個問題**同樣只改 `presets.py` 一處：在問題清單裡加一個 `Question`，
旗標與 `--help` 自動跟上。在別的地方再寫一份清單就是 bug。

## 開發

```bash
uv run pytest         # 測試
uv run ruff check .   # lint
```

模板資料夾被 ruff 排除（裡面不是合法 Python），改模板後靠「實際生一個專案出來」驗證。

## 未完成事項

- `app` preset（FastAPI + Vue3 + antd）只預留了資料夾與分派機制，模板內容是下一輪的事。
  現在跑 `smart-scaffold app` 會明確告訴你還沒有內容，而不是生出一個空專案。
- 只有終端機問答，沒有 TUI／GUI。問題定義與 renderer 已經分開，要加的時候只換
  `ask_all()` 的 `reader` / `writer`。
