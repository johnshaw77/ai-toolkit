#!/usr/bin/env bash
# PreToolUse hook（只掛在 Bash）：把幾條「絕對不要」從 prompt 變成機制。
#
# session-start.sh 注入的準則裡寫了「永遠不要 push」「不要 down -v」「無人值守
# 不要動 main」——但那只是文字，模型遵守的機率再高也不是 100%。`--loop` 又是
# 用 bypassPermissions 跑，沒有人會看到權限詢問。所以最傷的幾個動作在這裡直接攔。
#
# 攔什麼：
#   git push                         互動：ask（跳確認）／無人值守：deny
#   docker compose down -v/--volumes 互動：ask             ／無人值守：deny
#   在預設分支上 git commit           只在無人值守攔（deny）；互動時是使用者的選擇
#
# 其餘一律不表態（不輸出），交回正常的權限流程。
set -uo pipefail

exec 3>&1 1>&2

command -v jq >/dev/null 2>&1 || exit 0   # session-start 已經提示過缺 jq

input=$(cat)
j() { printf '%s' "$input" | jq -r "$1" 2>/dev/null; }

[ "$(j '.tool_name // ""')" = "Bash" ] || exit 0
cmd=$(j '.tool_input.command // ""')
[ -n "$cmd" ] || exit 0
cwd=$(j '.cwd // ""')
[ -n "$cwd" ] || cwd="$PWD"

unattended=0
[ -f "$cwd/.claude/UNATTENDED" ] && unattended=1

decide() {   # decide <ask|deny> <理由>
  jq -n --arg d "$1" --arg r "$2" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}' >&3
  exit 0
}

# 把指令切成一段一段（; && || | 換行），每段各自判斷「第一個指令是什麼」。
# 不對整串做 regex：`git commit -m "修正 push 通知"` 這種會被誤判成 push，
# 而無人值守時誤判 = 直接 deny，會把正常的 commit 擋掉。
# 引號內的分隔符號也會被切開，但切出來的片段第一個字不會剛好是 git／docker，無害。
# 用 awk 不用 sed：macOS 內建的 BSD sed 不認取代字串裡的 \n。
segments=$(printf '%s\n' "$cmd" | awk '{ gsub(/\|\||&&|;|\|/, "\n"); print }')

while IFS= read -r seg; do
  # shellcheck disable=SC2086
  read -ra w <<< "$seg"
  [ "${#w[@]}" -gt 0 ] || continue

  i=0
  # 跳過前置的環境變數指派（FOO=bar git push）與 sudo／command／env
  while [ "$i" -lt "${#w[@]}" ]; do
    case "${w[$i]}" in
      *=*|sudo|command|env|exec|time) i=$((i + 1)) ;;
      *) break ;;
    esac
  done
  [ "$i" -lt "${#w[@]}" ] || continue
  prog=$(basename -- "${w[$i]}")
  i=$((i + 1))

  case "$prog" in
    git)
      # 跳過 git 的全域選項，找到子指令（-C <路徑>、-c <設定> 帶一個參數）
      while [ "$i" -lt "${#w[@]}" ]; do
        case "${w[$i]}" in
          -C|-c|--git-dir|--work-tree|--namespace) i=$((i + 2)) ;;
          -*) i=$((i + 1)) ;;
          *) break ;;
        esac
      done
      sub="${w[$i]:-}"

      if [ "$sub" = "push" ]; then
        if [ "$unattended" = "1" ]; then
          decide deny "無人值守模式永遠不 push（unattended 守衛）。push 是對外動作，留給使用者回來後自己決定。請繼續下一項工作，最後在回報裡列出待 push 的分支。"
        fi
        decide ask "git push 是對外動作（unattended 守衛）。確定要 push 嗎？"
      fi

      if [ "$sub" = "commit" ] && [ "$unattended" = "1" ]; then
        branch=$(git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null)
        default=$(git -C "$cwd" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)
        default="${default#origin/}"
        case "$branch" in
          main|master|"$default")
            [ -n "$branch" ] && decide deny "無人值守模式不在預設分支（${branch}）上 commit（unattended 守衛）。先開一條分支再 commit：git checkout -b feat/<項目>"
            ;;
        esac
      fi
      ;;

    docker|docker-compose)
      # docker compose down …／docker-compose down …，參數裡有 -v 或 --volumes
      rest=" ${w[*]:$i} "
      if [[ "$prog" = "docker-compose" || "$rest" == *" compose "* ]] \
         && [[ "$rest" == *" down "* ]] \
         && [[ "$rest" =~ \ (-v|--volumes|-[a-zA-Z]*v[a-zA-Z]*)\  ]]; then
        if [ "$unattended" = "1" ]; then
          decide deny "docker compose down -v 會刪掉 volume 裡的資料（unattended 守衛），無人值守時一律不做。只是要重啟服務的話用 docker compose down（不加 -v）或 docker compose up -d --build。"
        fi
        decide ask "docker compose down -v 會刪掉 volume 裡的資料（unattended 守衛）。確定要清掉嗎？"
      fi
      ;;
  esac
done <<< "$segments"

exit 0
