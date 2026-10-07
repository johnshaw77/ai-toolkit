# ccdash — 多機器 Claude Code session 儀表板

## 目標

我（醬鍋）常在多台機器、多個專案同時開 Claude Code session（多半 SSH + tmux）。

需要一個終端儀表板，一眼看到所有 session 的狀態，尤其是「哪個在等我授權」。

## 環境

- 四台機器：MacBook Pro M4（主力開發）、兩台 Mac Mini（其中一台常駐，當 home server）、RTX 4090 PC（Windows）
- 機器之間用 Tailscale 互通；經常 SSH 進去開 tmux
- 常駐的 Mac Mini = collector 所在地

## 架構

```
每台機器的 Claude hooks ──POST──▶ collector（常駐 Mac Mini :7777）◀──GET── TUI（任何機器）
```

- 全部在單一檔案 `ccdash.py`，三種模式：`hook` / `serve` / `tui`（另有內部用的 `_post`）
- hook 與 collector 只用 Python 標準庫；TUI 需要 `rich`
- hook 解析事件後，交給背景子行程 `ccdash.py _post` 去查 tmux 位置並 POST，自己約 0.1 秒就 exit 0；
  collector 連不到（機器睡著、Tailscale 斷線）也不會拖慢 Claude
- Bash 指令與搜尋字串送出前會遮蔽像金鑰的部分（`KEY=`、`--token`、`Bearer`、32 字以上的亂碼），再截到 60 字
- collector 收件時檢查格式（`host`、`session_id` 必填，`state` 只能是 idle／working／waiting／ended），
  不合格回 400、超過 64 KB 回 413；時間由 collector 收到時蓋章，GET 回 `{"now", "sessions"}`，
  TUI 用 collector 的時間計算「持續」與「疑似卡住」，不受各台時鐘差影響
- collector 狀態存 `~/.ccdash-state.json`（原子寫入），超過 12 小時沒更新的 session 自動清除；讀檔時丟掉格式不對的舊資料
- 認證：共用 token，放在 `X-Token` header，以固定時間比對
- collector 預設只綁 `127.0.0.1`；綁其他位址時一定要設 `CCDASH_TOKEN`，否則拒絕啟動

## 環境變數

- `CCDASH_SERVER`：collector 位址，預設 `http://127.0.0.1:7777`
- `CCDASH_TOKEN`：共用密碼，四台要一樣
- `CCDASH_HOST`：顯示用機器名，每台不同

## 狀態判斷

- 🟡 等你：`Notification`（授權請求）；新出現時 TUI 響鈴
- 🟢 工作中：`UserPromptSubmit` / `PreToolUse` / `PostToolUse`
- 🔴 疑似卡住：工作中但 5 分鐘沒有任何事件
- ⚪ 閒置：`SessionStart` / `Stop`，以及 `notification_type` 為 `idle_prompt` 的閒置提醒（訊息含「waiting for your input」當備用判斷）
- `SessionEnd`：從 collector 移除

## 已驗證

在沙箱用模擬事件測過：
- collector 收事件、狀態轉換、錯誤 token 回 401
- Windows 路徑（`C:\work\stats`）能正確取出專案名
- TUI 排序與顯示正常

2026-10-07 在 MacBook Pro 本機實際跑過（細節見 repo 的 `docs/VERIFICATION.md`）：
- hook 每次約 0.1 秒結束；collector 指向連不到的位址時也是 0.1 秒
- 400／413／401 錯誤路徑、SessionEnd 移除、狀態檔不含金鑰、舊版壞資料重啟後被濾掉
- TUI 正常畫面、錯密碼與 collector 關掉時都只顯示訊息不當掉；沒裝 rich 時有安裝提示
- 沒設密碼綁 `0.0.0.0` 會拒絕啟動

## 尚未驗證（要在真實機器上確認）

- 真實 Claude Code hooks 傳入的 JSON 欄位與事件名稱是否與假設一致（`hook_event_name`、`session_id`、`cwd`、`tool_name`、`tool_input`、`message`、`notification_type`）
- 四台之間經 Tailscale 能否連到 collector
- Windows 那台的 hook command 寫法（`python "%USERPROFILE%\.claude\ccdash.py" hook`），以及背景子行程在 Windows 上能否正常脫離
- 在 tmux 內 `TMUX_PANE` 與 `tmux display-message` 是否抓得到 `session:window.pane`（現在改在背景子行程裡查）

## 部署步驟

見 `README.md`。重點：
- 四台都放 `~/.claude/ccdash.py`，並把 hooks 合併到 `~/.claude/settings.json`（已有 hooks 區塊要合併，不要覆蓋）
- Mac Mini 跑 `CCDASH_TOKEN=... python3 ccdash.py serve --bind $(tailscale ip -4)`，只綁 Tailscale IP；
  預設的 `127.0.0.1` 只有本機連得到

## 待辦（依優先序）

1. 在真實環境部署並用實際 session 驗證上面「尚未驗證」的項目，必要時修正事件欄位假設
2. 改用 Textual：選取一列按 Enter 跳到對應 tmux pane（同機用 `tmux select-window`，跨機先 SSH 到該機器）
3. 讀 transcript 的 usage 欄位，顯示各 session 的 token／費用
4. 長時間執行的工具（例如超過 5 分鐘的測試）會被誤標成🔴疑似卡住：PreToolUse 之後還沒有 PostToolUse 時，改顯示「執行中（工具名）」

## 注意

- 這套 hooks 放使用者層級（`~/.claude`），不進團隊 repo；若之後要給 15 人團隊共用，再包成標準 `.claude/` 設定
- 不要把 `CCDASH_TOKEN` 寫進 repo 或這份檔案
