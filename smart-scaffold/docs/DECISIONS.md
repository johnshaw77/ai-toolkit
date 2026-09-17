# 決策紀錄

追加式。過去的判斷即使後來被推翻，也是有用的脈絡，不要改寫既有條目。

---

## 2026-09-12　第一輪：問答引擎 + py preset

### 在空的 repo 上先開分支，main 暫時不存在

repo 建好但一顆 commit 都還沒有。無人值守規則要求「在分支上做，不要直接動
main」，所以直接 `git checkout -b feat/scaffold-core`，第一顆 commit 就落在
分支上。**代價**：合併之前 `git log main` 是查不到東西的，main 要等合併時才
生出來。換來的是使用者回來時能用一次 diff 看完全部改動。

### 模板放在套件裡（`src/smart_scaffold/templates/`），不放 repo 根目錄

放套件裡才能跟著 wheel 一起裝出去，`pip install` 之後模板還在。**代價**：模板
檔案會被 ruff 掃到（裡面是 `{{name}}` 佔位符，不是合法 Python），所以在
`pyproject.toml` 用 `extend-exclude` 把整個 `templates/` 排掉，改模板時只能靠
「實際生一個專案出來再 lint」驗證。

### 模板檔案用真實檔名（`.gitignore` 就叫 `.gitignore`）

另一種常見做法是存成 `gitignore.tmpl` 再於渲染時改名。沒採用，因為那等於在
渲染器裡多一套「檔名映射」的隱形規則，而 SPEC 要求的是「檔名照樣替換」而已。
**代價**：模板裡的 `.gitignore` 會對我們自己 repo 的那個資料夾生效，所以模板
的忽略規則不能寫得太廣。已確認目前 15 個模板檔案沒有一個被誤擋
（`git ls-files` 對得起來）。

### 佔位符正則只收合法識別字

`\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}`。這樣 `{{ .Ports }}` 這種 Go template
的寫法不會被誤判成變數——`docker ps --format` 用的就是它，未來模板裡真要放
Dockerfile 或 compose 也不會踩到。

### 「答案」與「模板變數」分成兩層

`when` 為假的題目**不會出現在答案裡**（SPEC 明文要求），但模板還是需要一個值，
否則渲染會因為變數未定義而中止。所以 `presets.build_variables()` 負責把答案翻
成模板變數並補上缺的（例如沒問埠時退回 8000）。這一層也讓模板變數名不必跟問題
`key` 綁死。

### `install` / `git` 也寫成問題，不是寫死的旗標

它們一樣進 `COMMON_QUESTIONS`，靠 `argparse.BooleanOptionalAction` 自動長出
`--install/--no-install`、`--git/--no-git`，同時互動模式也會問。好處是「新增一題
只改一處」這條規則沒有例外；**代價**是互動模式多了兩題要按 Enter。

### 名稱與描述有長度上限，而且描述用「顯示寬度」算

名稱與描述會被原樣寫進生成專案的程式碼裡，太長會讓對方的 `ruff` 直接爆
`E501`。這是實際驗證時踩到的：`demo_tool` 過得了、`demo_interactive` 就爆了。
所以加上 `MAX_NAME_LENGTH = 40`、`MAX_DESCRIPTION_WIDTH = 60`，而且描述用
東亞寬度計算（中文一個字算兩格）——**ruff 量的就是顯示寬度，不是字元數**。
同時把模板裡會隨名稱膨脹的那幾行拆開，讓它們的長度不再跟變數有關。

### 生成出來的專案「可以」有第三方依賴

「執行期零第三方依賴」是 smart-scaffold 自己的約束，不是生出來的專案的。
`py` preset 的模板用了 `pyyaml` + `python-dotenv`，因為 SPEC 要求
`config/settings.yaml` 與 `.env`，手寫 YAML parser 是明顯的壞主意。

### 模板多放了 `Makefile` 與 `.editorconfig`

SPEC 說列出的是下限。`Makefile` 順便當成 F4「`$` 不得被動到」的實地驗證——
裡面有 `$(MAKE)`，渲染後必須一字不變。

### git 找不到身分時用備援身分 commit

機器上沒設 `user.name` / `user.email` 時，`git commit` 會失敗，整個「第一顆
commit」就白做了。改成先檢查，缺的話用 `-c user.name=smart-scaffold` 帶過去。
**代價**：commit 的作者會是這個假身分，但總比沒有 commit 好。

### `docs/transcripts/` 不進版控

那是逐字對話紀錄，可能夾帶路徑、主機名或貼進來的秘密。這一輪先寫進
`.gitignore`；要分享時再逐份掃過。

---

## 2026-09-12　第二輪：app preset（FastAPI + Vue3 + antd）

### 藍本取自既有專案，但只抄「形狀」不抄業務

後端以結構最通用的那一套為藍本（經典 `api / core / db / models / repositories /
schemas / services` 分層、統一分頁 `Page[T]`、統一錯誤註冊、refresh token 輪替），
前端以「antd 後台殼」那一套為藍本，表格元件則取自另一個專案的 `ProTable`。

去品牌化的做法是**只搬抽象機制、不搬任何領域程式碼**：業務模組整批不要，換成一個
刻意中性的 `Item` 範例；角色從三種業務角色簡化成 `ADMIN` / `USER`；公司名、內部
主機名、示範帳密、寫死的埠號全部換掉。**代價**是模板缺了原專案那些經過實戰的細節
（RBAC、多租戶 `org_id`、稽核欄位自動寫入），但那些東西一旦放進通用模板，每個新專案
都要先花時間把不需要的拆掉——留白比較好拆。

### 佔位符改成「大括號裡不能有空白」

`{{var}}` 跟 Vue 的插值 `{{ user.name }}` 長得一模一樣，寫前端模板時直接撞車：
渲染器會把 `{{ brandInitial }}` 當成未定義的變數然後中止。

改的是規則而不是語法：**`{{var}}`（沒空白）是佔位符，`{{ expr }}`（有空白）原樣
留給 Vue。** prettier 會自動把 Vue 的插值排版成有空白的樣子，所以實務上不用特別
注意。**代價**是有人手寫 `{{foo}}`（沒空白）當 Vue 插值時會被誤判——但那種寫法
一跑 prettier 就會被改掉，風險很小。另一個選擇是加逃脫語法，但那等於要求每個寫
模板的人記得一條額外規則，更糟。

### 資料庫預設 sqlite，但 asyncpg 一起裝

新專案**開箱就要能跑**，不該先逼人裝 PostgreSQL、起容器、改連線字串才看得到畫面。
所以預設 `sqlite+aiosqlite`，而 `asyncpg` 一樣列在依賴裡，要換只要改 `DATABASE_URL`
一行。渲染器沒有條件語法，這樣也剛好不需要——模板只有一份，不必依選擇產生不同檔案。

**代價**：sqlite 沒有原生時區型別，讀回來的 datetime 是 naive。這在實測時炸過一次，
所以加了 `app/core/clock.py` 的 `as_utc()`，以及回應用的 `UTCDateTime` 型別。

### 前端 antd 整包註冊

`app.use(Antd)` 比 `unplugin-vue-components` 少一層設定，而且不會有「元件自動
註冊了但 `message` / `notification` 沒有」這種只有執行期才發現的坑。**代價**是
打包體積比較大（首屏 chunk 約 205 KB gzip 78 KB）。要瘦身時再換，寫在 README 的
未完成事項裡。

### 選 postgres 才問資料庫埠

`db_port` 這題掛了 `when`：只有 `database == "postgres"` 才問。用 sqlite 的人根本
沒有埠可以設，問了只是浪費時間。這也是 `when` 在真實 preset 裡的第一個用途——
第一輪只有單元測試在用它。

### 前端網址用 localhost 不用 127.0.0.1

Vite 預設綁 `localhost`，在這台機器上解析成 `::1`，`curl 127.0.0.1:5174` 直接不通。
文件與 `Makefile` 一律寫 `http://localhost:<port>`，跟 Vite 自己印出來的一致。
後端則維持 `127.0.0.1`（uvicorn 綁的就是它）。

---

## 2026-09-12　第三輪：按需匯入、端對端測試、容器化

### antd 改成按需匯入

換掉 `app.use(Antd)`，用 `unplugin-vue-components` + `AntDesignVueResolver`
（`importStyle: false`，樣式仍然統一由 `reset.css` 負責）。最大的 chunk 從
1,591.71 kB（gzip 498.68）降到 303.88 kB（gzip 109.31），而且照路由切開。

**代價**：命令式 API（`message`、`notification`、`Modal.confirm`）不會被自動
匯入，忘了 import 只有執行到那一行才會炸。這件事寫在 `vite.config.ts` 的註解裡
——那是最可能被翻到的地方。

意外收穫：整包註冊時 `a-table` 沒有真正的型別，`ProTable` 裡一個錯誤的斷言
（`ref<T[]>([]) as { value: T[] }`）一直沒被照出來，改成按需匯入之後 `vue-tsc`
立刻指出來。

### e2e 放在 frontend/ 而不是獨立的 package

Playwright 直接掛在前端那包 npm 專案底下，共用同一份 `node_modules` 與 eslint
設定。**代價**是 vitest 跟 playwright 的檔名慣例會撞（兩邊都認 `*.spec.ts`），
所以 vitest 的 `include` 明確限縮成 `src/**/*.spec.ts`。

e2e 用自己的資料庫檔並且每次重建。跟開發資料共用的話，「昨天過今天不過」的假
失敗遲早會出現，而那種問題最花時間。

### e2e 一定要有一條「console 不可以有 error 或 warning」

第二輪漏掉 `app.use(Antd)`，lint、type-check、單元測試、build 四道關卡全綠卻
沒人抓到，只有開瀏覽器才看得見。現在那個情境有測試守著。這條測試的價值不在於
它測了什麼功能，而在於它**擋住一整類「檢查全過但畫面是壞的」的問題**。

### PostgreSQL 用疊加檔，不用 compose profile

`profiles` 碰到 `depends_on` 會被自動啟用——選 sqlite 的人也會被迫跑一個用不到
的 postgres。疊加檔（`docker compose -f a.yml -f b.yml`）沒有這個問題，而且設一次
`COMPOSE_FILE` 之後所有指令都會自動吃到。**代價**是選 postgres 的人如果只跑
`docker compose up`，api 會連不到 db；失敗訊息很清楚，而且 README 有寫。

### 容器版的埠跟本機開發刻意錯開

`make api` / `make web` 跟 `docker compose up` 要能同時跑——同機開多個專案時，
埠撞在一起是最常見的卡點，而這支工具存在的理由之一就是解決這件事。埠在生成時
一次配好（只查一次 docker），不另外問使用者。

### 資料庫帳號從專案名算出來，不直接用專案名

PostgreSQL **不准角色名以 `pg_` 開頭**。專案叫 `pg_app` 時直接拿來當帳號會讓
`initdb` 失敗，而錯誤訊息埋在 db 容器的 log 裡，很難聯想到是專案名害的。
現在遇到這個前綴會自動加上 `app_`。

### 容器啟動時自動套 migration

entrypoint 先跑 `alembic upgrade head` 再起服務，失敗就直接退出。**代價**是多個
副本同時啟動時會搶著跑 migration（alembic 有鎖，最多是慢一點）。帶著錯誤的
schema 跑起來比不起來更難查，所以選擇讓它失敗得早一點。

---

## 2026-09-12　第四輪：web preset（FastAPI + Jinja2 + 零 Node）

### 為什麼要有第三個 preset

`nini_store` 這個實際專案用了 `py` preset，然後手寫了 FastAPI + Jinja2 + 原生 JS
的網頁層（7 個前端檔案加一支 `api.py`）。那個形態夾在既有兩個 preset 中間：
`py` 給不了 HTTP 與模板，`app` 又硬拉整套 npm 工具鏈進來。這一輪就是把那個
中間地帶補起來。

**`web` 與 `app` 的分界是「要不要前端工具鏈」**，不是「大小」。需要元件庫與
型別檢查就用 `app`，願意用手寫 CSS 換掉整個 Node 生態就用 `web`。

### 資料層用 stdlib sqlite3，不用 ORM

查詢都很直白，ORM 的抽象成本大於好處，而且少兩包依賴。**代價**是沒有 migration
版本管理：`init_db()` 可以重複執行，但既有資料的 schema 演進要自己處理。
這個 preset 的定位是小工具，我認為划算；資料模型會長期演化的專案該用 `app`。

### 認證用 cookie session，不是 JWT

伺服器端渲染的自然做法：HttpOnly cookie，前端完全不必管 token。
`SameSite=Lax` 是不另外做 CSRF token 的前提——要放寬成 `None` 就得補上。

**先給而不是之後補**：拿掉登入很容易，事後把登入塞進一個已經長大的專案很痛苦。

### e2e 用 pytest-playwright，不是 Node 版

這個 preset 的前提是零 Node，測試工具不該破例。`pytest-playwright` 是 Python
套件，`uv run playwright install chromium` 就能用。

e2e fixture 自己把服務跑起來（獨立暫存資料庫、隨機空閒埠），所以 `make e2e`
不需要先手動開任何東西。服務的輸出寫到檔案而不是 PIPE——沒人讀的 PIPE 會在
收尾時留下沒關的檔案描述子，塞滿了還會讓服務卡住。

### pytest 的 filterwarnings 設成 error

自己的程式碼冒警告就當成錯誤，不要讓它累積成背景雜訊。上游的警告用**精準**
的字串個別放行，並註明是誰的問題、何時該刪掉——不要用萬用的 ignore 把整類
警告關掉。

### 狀態標籤的唯一來源在後端

一開始 Python 與 JS 各有一份中文標籤，結果表格顯示「草稿」、表單卻顯示 `DRAFT`。
改成後端用 `tojson` 把對照表塞進 `data-` 屬性，JS 讀它。

**那個屬性一定要用單引號包**：Jinja 的 `tojson` 會跳脫單引號但不會跳脫雙引號，
用雙引號包的話 JSON 裡的引號會把屬性提早關掉，整個表格就不見了。

### 容器對外的埠變數叫 HOST_PORT，不叫 APP_PORT

**compose 會讀專案根目錄的 `.env`**，而 `web` preset 的 `.env` 就在根目錄，
裡面的 `APP_PORT` 是給應用程式用的。同名的話 `${APP_PORT:-8004}` 會被 `.env`
的值蓋掉，容器直接映到本機開發那個埠上，跟 `make run` 撞死。

（`app` preset 沒這個問題，因為它的 `.env` 在 `backend/` 底下，不在 compose 旁邊。）

---

## 2026-09-13　第五輪：範例領域改成可選，而且預設關掉

### 問題

`web` 有 672 行（佔生成程式碼的 36%）、`app` 有 553 行（17%）是純粹的示範領域，
而且不是刪幾個檔案就好——`api.py` 裡有 28 處提到 item，`db.py` 的 schema、
seed 的資料、選單、路由都要一起動。**每開一個新專案就要清一次**，那是純摩擦。

原本的取捨是「示範領域＝形狀範本」，但只寫了「換成你自己的」，沒算過代價。
算出來之後結論很清楚：該讓它可選。

### 預設關掉，不是預設開著

`--demo` 才給。理由是「開新專案」比「學慣例」常見得多，而且想看範本的時候
另外生一個帶 `--demo` 的專案來對照，成本是零——不必污染真正要開發的那一個。

**代價**：乾淨版沒有一個完整的 CRUD 範例可以照抄。但登入、設定兩層、錯誤格式、
外殼、前端工具、對應的測試都還在，慣例仍然看得到。

### 條件式內容用「標記行」而不是模板語言

渲染器刻意維持「只做字串替換」的簡單度，不引入 Jinja 那種模板語言——模板本身
**就包含** Jinja 與 Vue 的語法，再疊一層只會打架。

所以用標記行：`scaffold:if <旗標>` / `scaffold:ifnot <旗標>` / `scaffold:endif`。
只認中間那串字，前後是 `#`、`//`、`{# #}`、`<!-- -->` 都行，一套語法吃遍
Python、JS、Jinja、HTML、SQL。

**條件成立時只拿掉標記那幾行**，所以生出來的專案看不到標記——這點很重要，
否則每個新專案都帶著一堆維護痕跡。

### 整個檔案的條件放在模板自己的 .scaffold.toml

不寫在 `presets.py`，因為「哪些檔案屬於範例領域」是模板自己的事，跟它放在一起
才不會改了模板忘了改別處。用 `tomllib`（標準庫），不破壞零依賴。

有一條測試會檢查清單裡的檔案真的存在——列了不存在的路徑等於沒設定，而且不會
有人發現。

### 兩個實作上的坑（已寫進 README）

**空白行要放在標記區段裡**，否則整段移除後會多出空行，ruff 的 I001 會抱怨。

**import 要兩種模式都排序正確**。`from x import (a, b, item, c,)` 用括號展開加
結尾逗號，把有條件的那一行單獨包起來；拆成兩個 import 敘述會讓 isort 在
demo 模式下抱怨。

### 乾淨版要有地方可以去

`web` 原本 `/` 是導向 `/items`，拿掉範例之後整個應用沒有任何頁面。補了一個
`home.html`，內容是「接下來做什麼」的四個步驟。`app` 本來就有 HomeView，
只需要把「資料筆數」那張卡與相關 import 包進條件裡。
