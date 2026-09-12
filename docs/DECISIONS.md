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
