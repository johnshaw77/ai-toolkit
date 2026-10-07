# ccdash

多機器 Claude Code session 儀表板。在多台機器、多個專案同時開 Claude Code 時，一眼看到每個 session 的狀態，尤其是「哪個在等我授權」。

```
每台機器的 Claude hooks ──POST──▶ collector（常駐 Mac Mini :7777）◀──GET── TUI（任何機器）
```

全部在單一檔案 `ccdash.py`：

| # | 模式 | 做什麼 | 需要 |
|---:|---|---|---|
| 1 | `hook` | 由 Claude Code hooks 呼叫，把狀態交給背景子行程送到 collector；約 0.1 秒結束，絕不拖慢 Claude | Python 標準庫 |
| 2 | `serve` | collector，收集所有機器的狀態，存在 `~/.ccdash-state.json` | Python 標準庫 |
| 3 | `tui` | 終端儀表板 | `pip install rich` |

## 先在一台機器試

1. 開 collector（開一個分頁，讓它一直跑）：

   ```bash
   CCDASH_TOKEN=試用密碼 python3 ccdash.py serve
   ```

   看到 `ccdash collector on 127.0.0.1:7777  (token ON)` 就表示開好了。

2. 開 TUI（另開一個分頁，`Ctrl-C` 離開）：

   ```bash
   pip install rich        # 第一次才需要
   CCDASH_TOKEN=試用密碼 python3 ccdash.py tui
   ```

3. 把 `ccdash.py` 放到 `~/.claude/`：

   ```bash
   cp ccdash.py ~/.claude/ccdash.py
   ```

4. 把下面這兩段**合併**進 `~/.claude/settings.json`。如果檔案裡已經有 `env` 或 `hooks` 區塊，要把內容加進去，不要整段覆蓋：

   ```json
   "env": {
     "CCDASH_TOKEN": "試用密碼",
     "CCDASH_HOST": "MBP"
   },
   "hooks": {
     "SessionStart":     [{ "hooks": [{ "type": "command", "command": "python3 ~/.claude/ccdash.py hook" }] }],
     "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "python3 ~/.claude/ccdash.py hook" }] }],
     "PreToolUse":       [{ "matcher": "*", "hooks": [{ "type": "command", "command": "python3 ~/.claude/ccdash.py hook" }] }],
     "PostToolUse":      [{ "matcher": "*", "hooks": [{ "type": "command", "command": "python3 ~/.claude/ccdash.py hook" }] }],
     "Notification":     [{ "hooks": [{ "type": "command", "command": "python3 ~/.claude/ccdash.py hook" }] }],
     "Stop":             [{ "hooks": [{ "type": "command", "command": "python3 ~/.claude/ccdash.py hook" }] }],
     "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "python3 ~/.claude/ccdash.py hook" }] }]
   }
   ```

5. 開一個**新的** Claude Code 視窗，隨便問點東西。TUI 上會出現一列，從 ⚪ 閒置變成 🟢 工作中；遇到要你授權時變 🟡，並響一聲。

## 部署到多台機器

1. **常駐的 Mac Mini 跑 collector**，只綁 Tailscale IP：

   ```bash
   CCDASH_TOKEN=正式密碼 python3 ccdash.py serve --bind $(tailscale ip -4)
   ```

   要讓它常駐，可以放在 tmux 裡跑。預設的 `127.0.0.1` 只有本機連得到；綁其他位址時一定要設 `CCDASH_TOKEN`，否則會拒絕啟動。

2. **每台機器**都放 `~/.claude/ccdash.py`，合併上面的 hooks，`env` 設成：

   | # | 變數 | 值 |
   |---:|---|---|
   | 1 | `CCDASH_SERVER` | `http://<Mac Mini 的 Tailscale IP>:7777` |
   | 2 | `CCDASH_TOKEN` | 每台都一樣 |
   | 3 | `CCDASH_HOST` | 每台不同，例如 `MBP`、`Mini1`、`Mini2`、`4090` |

3. **Windows** 的 hook 指令改成：

   ```
   python "%USERPROFILE%\.claude\ccdash.py" hook
   ```

4. **看儀表板**：任何一台設好 `CCDASH_SERVER`、`CCDASH_TOKEN` 後執行 `python3 ccdash.py tui`。

四台的 `ccdash.py` 請一起更新：新版 collector 的 GET 回 `{"now", "sessions"}`，新版 TUI 也能讀舊格式，但混用舊版 hook 時，格式不對的事件會被 collector 回 400。

## 怎麼看儀表板

| # | 狀態 | 意思 |
|---:|---|---|
| 1 | 🟡 等你 | 在等你授權，排在最上面，新出現時響鈴 |
| 2 | 🟢 工作中 | 正在思考或跑工具，「正在做什麼」欄顯示工具和內容 |
| 3 | 🔴 疑似卡住 | 工作中，但 5 分鐘沒有任何動靜 |
| 4 | ⚪ 閒置 | 做完了，在等你下一個指令 |

- **持續**：目前狀態維持多久，用 collector 的時間計算，不受各台機器時鐘差影響。
- **tmux**：`session:window.pane`，告訴你要切到哪個 pane。
- 指令裡看起來像金鑰的部分（`KEY=`、`--token`、`Bearer`、很長的亂碼）會先遮成 `***` 才送出。
- 超過 12 小時沒更新的 session 會自動清掉；Claude Code 結束時會直接移除。

## 選項

| # | 指令 | 選項 | 預設 |
|---:|---|---|---|
| 1 | `serve` | `--bind`：綁定位址 | `127.0.0.1` |
| 2 | `serve` | `--port`：埠號 | `7777` |
| 3 | `serve` | `--state`：狀態檔 | `~/.ccdash-state.json` |
| 4 | `tui` | `--interval`：刷新間隔（秒） | `1.0` |

## 疑難排解

| # | 看到 | 怎麼辦 |
|---:|---|---|
| 1 | TUI：「連不上 collector」 | collector 沒開，或 `CCDASH_SERVER` 指錯；在那台機器 `curl http://<IP>:7777/` 試試 |
| 2 | TUI：「密碼不對」 | `CCDASH_TOKEN` 跟 collector 啟動時用的不一樣 |
| 3 | `serve`：「拒絕在 … 上不設密碼對外開放」 | 設定 `CCDASH_TOKEN`，或改綁 `127.0.0.1` |
| 4 | TUI：「TUI 需要 rich」 | `pip install rich` |
| 5 | 開了 Claude 但 TUI 沒出現 | 確認 hooks 有合併進 `~/.claude/settings.json`，而且是**新開**的 Claude 視窗 |

hook 送不出去時不會有任何錯誤訊息，這是刻意的：它絕不能影響 Claude。可以手動打一筆事件，看 TUI 有沒有出現：

```bash
echo '{"hook_event_name":"SessionStart","session_id":"test-1","cwd":"/tmp/demo"}' | python3 ~/.claude/ccdash.py hook
```

## 開發狀態

已在本機用模擬事件驗證過：collector 的正常與錯誤路徑、hook 的速度、金鑰遮蔽、TUI 畫面。真實的 Claude Code 事件、跨機器的 Tailscale 連線、Windows 上的背景子行程都還沒驗證，見 [`CLAUDE.md`](CLAUDE.md)。
