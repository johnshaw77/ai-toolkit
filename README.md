# ai-toolkit

自己寫來輔助開發的工具，收在同一個 repo。三個東西彼此獨立，可以只裝需要的那個。

| # | 工具 | 是什麼 | 形態 |
|---:|---|---|---|
| 1 | [`unattended-workflow/`](unattended-workflow/) | 讓 Claude Code 一路做到底再回報，並把每次對話存成 HTML | Claude Code plugin |
| 2 | [`screencast/`](screencast/) | 用 Playwright 操作網頁錄操作教學影片，含假游標與 TTS 旁白 | Claude Code skill |
| 3 | [`smart-scaffold/`](smart-scaffold/) | 逐步問答式的專案腳手架，問完就生出可以動工的骨架 | 獨立 Python CLI |

## 安裝

三者各自獨立，挑要用的裝就好。

### 1. unattended（plugin）

在 Claude Code 裡：

```
/plugin marketplace add johnshaw77/ai-toolkit
/plugin install unattended
```

然後**完全關掉 Claude Code 再重開**——hook 是在對話開始時載入的。
接著 `/unattended:install-bin` 把 `unattended` 指令接上 PATH。

完整說明（`/unattended:spec` 怎麼用、完成度守門員擋什麼、tmux 與 `--loop`）
見 [`unattended-workflow/README.md`](unattended-workflow/README.md)。

> 以前這是獨立 repo `johnshaw77/claude-unattended-workflow`，已封存。
> 裝過舊版的話先 `/plugin marketplace remove claude-unattended-workflow`。

### 2. screencast（skill）

**最省事的裝法：在 Claude Code 裡直接說**

```
照 github.com/johnshaw77/ai-toolkit 的 README 幫我裝 screencast
```

Claude 會照下面的步驟裝（Mac、Windows 都行），最後跑 `npm run doctor` 確認全部就緒；
中間缺什麼、哪步失敗，它會自己排除。更新也一樣，說「幫我更新 screencast」就好。

想自己動手的話，照下面做。Mac 與 Windows 都能用，先裝好 [Node.js](https://nodejs.org)（18 以上）與 git。

**Mac**

```bash
brew install ffmpeg uv
uv tool install edge-tts                       # 預設語音（微軟曉臻）

git clone https://github.com/johnshaw77/ai-toolkit.git ~/ai-toolkit
mkdir -p ~/.claude/skills
ln -s ~/ai-toolkit/screencast ~/.claude/skills/screencast
cd ~/ai-toolkit/screencast
npm install
npx playwright install chromium
npm run doctor                                 # 全部 ✓ 就能用了
```

**Windows**（PowerShell，不需要系統管理員）

```powershell
winget install Gyan.FFmpeg
winget install astral-sh.uv
# ↑ 裝完關掉 PowerShell 重開，ffmpeg、uv 才找得到
uv tool install edge-tts
uv tool update-shell                           # 讓 edge-tts 進 PATH，之後再重開一次 PowerShell

git clone https://github.com/johnshaw77/ai-toolkit.git $HOME\ai-toolkit
New-Item -ItemType Directory -Force $HOME\.claude\skills
New-Item -ItemType Junction -Path $HOME\.claude\skills\screencast -Target $HOME\ai-toolkit\screencast
cd $HOME\ai-toolkit\screencast
npm install
npx playwright install chromium
npm run doctor
```

`npm run doctor` 會檢查 Node、Chromium、ffmpeg（含需要的編碼器）、edge-tts 能不能連到
微軟、skill 有沒有接到 Claude Code；缺什麼就印出要跑的那一行。

**更新**：`cd ~/ai-toolkit && git pull`，再到 `screencast/` 跑一次 `npm install`。
skill 是用連結接上的，更新完開新的 Claude Code 對話就會生效。

怎麼寫 scenario、換語音、開鏡頭推近，見 [`screencast/README.md`](screencast/README.md)。

### 3. smart-scaffold（CLI）

```bash
uv tool install --editable ./smart-scaffold
smart-scaffold --help
```

`--editable` 是刻意的：改 repo 立刻生效，不用重裝。
三個 preset（`py` / `web` / `app`）的差別見
[`smart-scaffold/README.md`](smart-scaffold/README.md)。

## 這個 repo 的結構

```
ai-toolkit/
├── .claude-plugin/marketplace.json   ← plugin marketplace 清單（目前只有 unattended）
├── unattended-workflow/              ← plugin 根，自己有 .claude-plugin/plugin.json
├── screencast/                       ← skill 根，SKILL.md 在這一層
└── smart-scaffold/                   ← Python 套件根
```

三個子目錄都是用 `git subtree` 併進來的，各自的 commit 歷史都在
（`git log --full-history -- <子目錄>`）。各子目錄有自己的 README 與 CLAUDE.md，
改動時看那一份。

## 授權

MIT
