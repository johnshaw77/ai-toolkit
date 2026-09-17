# smart-scaffold

一支開新專案的腳手架工具。逐步問答問完該問的，然後生成骨架、裝依賴、`git init`
並產生第一顆繁體中文 commit。

## 為什麼要有它

現有專案都是「開工之後才看到生出來的結構，然後妥協」，所以每個專案長得都不一樣。
把結構決定的時機提前到**什麼都還沒寫的時候**，改的成本是零。

## 安裝

執行期**零第三方依賴**，只用標準庫，所以在任何一台裝好 Python 3.12 的機器上都跑得動。

**裝成全域指令**（日常用這個）：

```bash
uv tool install --editable /path/to/smart-scaffold
```

裝完在**任何目錄**都能直接打 `smart-scaffold`。`--editable` 的意思是它跟著這個
repo 走——之後改了模板或加了 preset，不用重裝就生效。

要移除：`uv tool uninstall smart-scaffold`。

**不想裝也可以**，從任何目錄指定專案位置跑：

```bash
uv run --project /path/to/smart-scaffold smart-scaffold web --name demo
```

或者 `cd` 進 repo 裡 `uv run smart-scaffold ...`。

> 注意：`python3 -m smart_scaffold` **不會動**，除非你先 `uv sync` 再從 repo 裡跑，
> 或自己設 `PYTHONPATH=src`。套件在 `src/` 底下，不在匯入路徑上。

## 怎麼用

兩個 preset：

| preset | 生出什麼 | 什麼時候用 |
|---|---|---|
| `py` | Python 專案：uv + `src/` 套件分層 + `scripts/` + `config/` | 函式庫、CLI、腳本 |
| `web` | FastAPI + Jinja2 + 原生 JS + sqlite，**零 Node** | 一個人或小團隊要用的內部工具 |
| `app` | FastAPI + SQLAlchemy 2.0 (async) + Vue 3 + Ant Design Vue | 需要豐富互動的後台 |

**預設生出來的專案是乾淨的**——沒有任何範例資料表或範例頁面，不用先花時間清掉
別人的東西。想看一組接好的完整範本（列表／搜尋／分頁／CRUD）就加 `--demo`，
通常是另外生一個專案來對照，而不是加在要正式開發的那一個上。

`web` 與 `app` 的差別是**要不要前端工具鏈**。`web` 沒有建置步驟，改完存檔重新
整理就看得到，裝好 Python 就能跑；代價是複雜互動得自己寫。`app` 給你元件庫與
型別檢查，代價是 npm 那一整套。

互動模式——問完每一題就開始生：

```bash
uv run smart-scaffold py
uv run smart-scaffold app
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

生成完會做三件事：裝依賴 → `git init -b main` → 第一顆 commit。
依賴安裝的步驟由 preset 決定（`app` 會分別裝後端的 `uv sync` 與前端的
`npm install`）。**任何一步失敗都不會中止**，只會在總結裡叫你自己補跑。

`app` preset 生出來的東西：登入頁、側邊欄 + 頂欄的後台殼、深色模式、
可重用的 `ProTable`（接後端統一的 `Page[T]` 分頁格式）、JWT + refresh token
輪替、統一錯誤格式、軟刪除，以及 12 個 Playwright 端對端測試——其中一條會走過
每一頁並斷言 console 沒有任何 error 或 warning。

容器化也備好了：前後端各一個 Dockerfile、nginx（SPA fallback + API 轉發）、
`docker compose up -d --build` 一行起整套，容器啟動時自動套 migration。
**容器版對外的埠跟本機開發的刻意錯開**，兩邊可以同時跑。

資料庫預設 sqlite（開箱即跑），要換 PostgreSQL 就疊
`docker-compose.postgres.yml`。

![app preset 生出來的樣子](docs/screenshots/app-preset-items.jpg)

埠號是算出來的：從 8000 往後找第一個沒被佔用的埠，判定來源是實際 bind 測試加上
`docker ps` 已發布的埠。機器上沒有 docker 只是少一個來源，不會出錯。

## 模板放在哪

```
src/smart_scaffold/templates/
├── py/     # Python 專案：uv + src/ 套件分層 + scripts/ + config/
├── web/    # 網頁工具：FastAPI + Jinja2 + 原生 JS + sqlite，零 Node
└── app/    # 全端：FastAPI + SQLAlchemy 2.0 + Vue3 + Ant Design Vue
```

模板裡的佔位符是 `{{var}}`，**大括號裡不能有空白**，而且**檔名與資料夾名也會
被替換**（例：`src/{{name}}/__init__.py`）。

兩條容易踩到的規則：

* 刻意不用 `$var`，因為模板裡有 Makefile 與 shell，`$(MAKE)` 和 `$$` 不能被動到。
* 「不能有空白」是為了跟 **Vue 與 Jinja2** 共存——它們的插值長得一模一樣。
  `{{var}}` 是佔位符，`{{ expr }}`（有空白）原樣留給模板引擎。Vue 那邊 prettier
  會自動排成有空白；Jinja 要自己記得，`web` preset 有一條測試在把關。

## 有條件的模板內容

同一份模板要能生出「乾淨版」與「帶範例版」，靠兩個機制：

**整個檔案**——在模板根目錄放 `.scaffold.toml`（它自己不會被複製進去）：

```toml
[optional]
demo = ["src/{{name}}/items.py", "tests/test_items.py"]
```

旗標為假時，清單裡的檔案與資料夾整個略過。

**檔案裡的片段**——用標記包起來。前後是什麼註解符號都行，渲染器只認中間那串字：

```python
# scaffold:if demo
只有 demo 時才要的內容
# scaffold:endif
```

```html
{# scaffold:ifnot demo #}
沒有 demo 時才要的內容
{# scaffold:endif #}
```

條件成立時**只拿掉標記那幾行**，所以生出來的專案看不到標記。不成立時整段拿掉。
標記不成對會中止並指出是哪個檔案。

兩個實作上的坑，改模板時會遇到：

* **空白行要放進標記區段裡**，否則整段拿掉之後會多出空行，`ruff` 會抱怨。
* **import 要能兩種模式都排序正確**。只有某個模式才需要的 import，用括號展開的
  多行寫法加結尾逗號（magic trailing comma），把那一行單獨包起來。

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

- 只有終端機問答，沒有 TUI／GUI。問題定義與 renderer 已經分開，要加的時候只換
  `ask_all()` 的 `reader` / `writer`。
- `app` preset 的容器設定是給**本機與內網**用的：沒有 TLS、沒有反向代理前面那一層、
  密碼與金鑰都是開發用的預設值。要上正式環境得自己補。
- 沒有 CI 設定檔。`make check` 就是完整的驗證流程，接到 CI 上只是把它抄過去，
  但每家 CI 的寫法不同，沒有硬塞一份。
