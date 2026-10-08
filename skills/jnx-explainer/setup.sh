#!/usr/bin/env bash
# 本機一次性設定：Python 虛擬環境 + 繁中字型。重跑無害。
set -euo pipefail
cd "$(dirname "$0")"

command -v ffmpeg >/dev/null || { echo "缺 ffmpeg：brew install ffmpeg"; exit 1; }
command -v node >/dev/null || { echo "缺 Node 22 以上"; exit 1; }

if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q numpy scipy fonttools playwright pillow edge-tts

# build.py 用 Noto Sans CJK TC 的 Bold / Medium 做字型子集
mkdir -p fonts
base=https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/TC
for w in Bold Medium; do
  f=fonts/NotoSansCJKtc-$w.otf
  [ -s "$f" ] || curl -fsSL "$base/NotoSansTC-$w.otf" -o "$f"
done

echo "完成。之後一律用 .venv/bin/python 執行各專案的 py 檔。"
