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
