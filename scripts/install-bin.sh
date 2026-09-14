#!/usr/bin/env bash
# 把 bin/unattended 接上 PATH。給 /unattended:install-bin 呼叫，也可以手動跑。
#
#   macOS / Linux / WSL   在 PATH 裡建 symlink
#   Windows（Git Bash）   在 ~/.bashrc 加 alias（Git Bash 的 ln -s 預設是複製）
#
# 一律指向 marketplace 目錄（claude plugin update 會 pull 的那份），
# 不指向 CLAUDE_PLUGIN_ROOT：那是帶版號的快取目錄，下次更新就斷了。
#
# 可以重複執行：已經裝好就不動，舊的複製版會被換掉，rc 檔的修改有標記不會重複加。
# 測試用：UNATTENDED_INSTALL_PLATFORM=darwin|linux|gitbash 蓋掉平台偵測。
set -uo pipefail

CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
RC_MARK="# unattended plugin（/unattended:install-bin）"
# 只有內容含這串的檔案才算「我們的腳本」，才可以被覆蓋
SCRIPT_SIGNATURE='啟動一次「無人值守」的 Claude Code 執行'

ok()   { printf '✓ %s\n' "$*"; }
warn() { printf '⚠ %s\n' "$*"; }
fail() { printf '✗ %s\n' "$*"; exit 1; }

# ── 1. 找 marketplace 目錄 ──
src_root=""
known="$CONFIG_DIR/plugins/known_marketplaces.json"
if [ -f "$known" ] && command -v jq >/dev/null 2>&1; then
  while IFS= read -r loc; do
    [ -n "$loc" ] || continue
    if [ -f "$loc/bin/unattended" ] && \
       [ "$(jq -r '.name // ""' "$loc/.claude-plugin/plugin.json" 2>/dev/null)" = "unattended" ]; then
      src_root="$loc"; break
    fi
  done < <(jq -r '.[].installLocation // empty' "$known" 2>/dev/null)
fi
[ -n "$src_root" ] || {
  fallback="$CONFIG_DIR/plugins/marketplaces/claude-unattended-workflow"
  [ -f "$fallback/bin/unattended" ] && src_root="$fallback"
}
[ -n "$src_root" ] || fail "找不到 plugin 的 marketplace 目錄（$CONFIG_DIR/plugins/marketplaces/…）。先 /plugin install unattended。"
src="$src_root/bin/unattended"
ok "來源：$src"

# ── 2. 平台 ──
platform="${UNATTENDED_INSTALL_PLATFORM:-}"
if [ -z "$platform" ]; then
  case "$(uname -s)" in
    Darwin) platform=darwin ;;
    MINGW*|MSYS*|CYGWIN*) platform=gitbash ;;
    *) platform=linux ;;          # 含 WSL：它是真的 Linux，symlink 可以用
  esac
fi
ok "平台：$platform"

in_path() { case ":$PATH:" in *":$1:"*) return 0 ;; *) return 1 ;; esac; }
is_ours() { [ -f "$1" ] && grep -qF "$SCRIPT_SIGNATURE" "$1" 2>/dev/null; }

# ── 3a. Windows（Git Bash）：alias ──
if [ "$platform" = gitbash ]; then
  rc="$HOME/.bashrc"
  line="alias unattended='bash \"$src\" --no-tmux'"
  touch "$rc"
  if grep -qxF "$line" "$rc"; then
    ok "~/.bashrc 已經有 alias，不用改"
  else
    # 移除舊的（標記行 + 下一行），再寫新的
    tmp=$(mktemp)
    awk -v mark="$RC_MARK" '$0 == mark { skip = 1; next } skip { skip = 0; next } { print }' "$rc" > "$tmp" && cat "$tmp" > "$rc"
    rm -f "$tmp"
    printf '\n%s\n%s\n' "$RC_MARK" "$line" >> "$rc"
    ok "已在 ~/.bashrc 加上 alias（開新的 Git Bash 視窗，或執行 source ~/.bashrc）"
  fi
  if old=$(command -v unattended 2>/dev/null) && [ -f "$old" ]; then
    warn "PATH 裡另外有一份 ${old}（大概是以前複製的舊版）。互動式 shell 會優先用 alias，但建議刪掉以免混淆。"
  fi
  bash "$src" --help >/dev/null 2>&1 && ok "試跑 unattended --help 成功" || fail "試跑 $src --help 失敗"
  warn "Windows 沒有 tmux，alias 已經帶 --no-tmux：執行時視窗不能關，電腦不能睡（設定 → 系統 → 電源）。"
  exit 0
fi

# ── 3b. macOS / Linux / WSL：symlink ──
target_dir=""
existing=$(command -v unattended 2>/dev/null || true)
if [ -n "$existing" ]; then
  if [ -L "$existing" ] && [ "$(readlink "$existing")" = "$src" ]; then
    ok "已經裝好：$existing → $src"
    "$existing" --help >/dev/null 2>&1 && ok "試跑 unattended --help 成功"
    command -v tmux >/dev/null || warn "沒有 tmux：執行時要加 --no-tmux，或先安裝（macOS：brew install tmux）"
    exit 0
  fi
  # is_ours 用 grep 讀檔，會跟著 symlink 走：指向舊快取目錄的 symlink 也算我們的
  if is_ours "$existing"; then
    target_dir=$(dirname "$existing")
    if [ -L "$existing" ]; then
      ok "換掉舊的：${existing}（symlink 指向 $(readlink "$existing")，不會跟著更新）"
    else
      ok "換掉舊的：${existing}（複製的副本，不會跟著更新）"
    fi
  elif [ -L "$existing" ] && [ ! -e "$existing" ]; then
    target_dir=$(dirname "$existing")
    ok "換掉斷掉的 symlink：$existing → $(readlink "$existing")"
  else
    fail "PATH 裡已經有一個不相干的 ${existing}，不覆蓋。請改名或移除後再跑一次。"
  fi
fi

rc_changed=""
if [ -z "$target_dir" ]; then
  target_dir="$HOME/.local/bin"
  mkdir -p "$target_dir" || fail "無法建立 $target_dir"
  if ! in_path "$target_dir"; then
    case "$(basename "${SHELL:-bash}")" in
      zsh)  rc="$HOME/.zshrc" ;;
      bash) rc="$HOME/.bashrc"; [ "$platform" = darwin ] && rc="$HOME/.bash_profile" ;;
      *)    rc="" ;;
    esac
    if [ -n "$rc" ]; then
      if ! grep -qxF "$RC_MARK" "$rc" 2>/dev/null; then
        printf '\n%s\n%s\n' "$RC_MARK" 'export PATH="$HOME/.local/bin:$PATH"' >> "$rc"
      fi
      rc_changed="$rc"
    else
      warn "$target_dir 不在 PATH 裡，而且認不得你的 shell（${SHELL}）。請自己把它加進 PATH。"
    fi
  fi
fi

link="$target_dir/unattended"
ln -sf "$src" "$link" || fail "建立 symlink 失敗：$link"
ok "symlink：$link → $src"
[ -n "$rc_changed" ] && ok "$target_dir 原本不在 PATH，已加進 ${rc_changed}（開新的終端機才生效）"

"$link" --help >/dev/null 2>&1 && ok "試跑 unattended --help 成功" || fail "試跑 $link --help 失敗"
command -v tmux >/dev/null || warn "沒有 tmux：執行時要加 --no-tmux，或先安裝（macOS：brew install tmux ／ Linux：sudo apt install tmux）"
exit 0
