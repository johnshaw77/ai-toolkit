---
description: "把 unattended 啟動腳本接上 PATH（macOS/Linux 用 symlink、Windows Git Bash 用 alias）"
allowed-tools: ["Bash(bash:*)"]
---

# 安裝 unattended 指令

裝 plugin 時整個 repo 已經 clone 到本機，`bin/unattended` 就在裡面，只是沒有接上 PATH。
這個指令負責接上。

## 做什麼

用 Bash 執行，**只跑這一行，不要自己另外 `cp`、`ln` 或改 rc 檔**：

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/install-bin.sh"
```

腳本會自己處理：

- 找到 marketplace 目錄（`claude plugin update` 會更新的那份）當來源——
  **不是** `CLAUDE_PLUGIN_ROOT`，那是帶版號的快取，下次更新就斷了。
- macOS / Linux / WSL：在 PATH 裡建 symlink；`~/.local/bin` 不在 PATH 就加進 shell 的 rc 檔。
- Windows（Git Bash）：在 `~/.bashrc` 加上帶 `--no-tmux` 的 alias。
- 以前用 `cp` 複製的舊版會被換掉；PATH 裡有不相干的同名檔案則不覆蓋。
- 重複執行是安全的。

## 執行後要回報

把腳本輸出的 ✓ ／ ⚠ ／ ✗ 照實轉述，並補充：

1. **改了哪些檔案**（symlink 建在哪、有沒有動到 `~/.zshrc`／`~/.bashrc`）。
2. **要不要開新的終端機**：有改 rc 檔就要，否則 `unattended` 在目前的 shell 找不到。
3. 有 ⚠ 沒有 tmux 的話，說明兩個選擇：安裝 tmux，或執行時加 `--no-tmux`。
4. 下一步怎麼用：
   ```
   unattended --help
   unattended --loop           # 依 SPEC.md 每一項開一場新對話
   ```

腳本回 ✗ 就停下來，把訊息轉告使用者，不要自己想辦法繞過（例如手動覆蓋 PATH 裡不相干的檔案）。
