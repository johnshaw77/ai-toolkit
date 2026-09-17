#!/usr/bin/env python3
"""
把 Claude Code 的 session transcript (.jsonl) 轉成可離線調閱的 HTML。

用法：
    transcript2html.py --here [專案路徑]          ★ 存進專案自己的 docs/transcripts/
    transcript2html.py --here <專案> <file.jsonl> 同上，但只轉這一個 session
    transcript2html.py <file.jsonl>              轉單一 session（存到全域）
    transcript2html.py --all                     轉全部專案（存到全域）
    transcript2html.py --index                   只重建全域索引頁

--here 是給「想跟團隊分享」用的：只收這個專案的對話，輸出成自足 HTML，
放在 <專案>/docs/transcripts/（附 .gitignore，預設不進版控）。
其餘模式輸出到 ~/.claude/transcripts/。
"""
import json
import os
import re
import sys
import html
import datetime
from pathlib import Path

PROJECTS = Path.home() / ".claude" / "projects"
OUTROOT = Path.home() / ".claude" / "transcripts"
MAX_BLOB = 6000          # 單一 tool 輸入/輸出最多顯示幾個字元
SKIP_TYPES = {
    "attachment", "mode", "permission-mode", "last-prompt", "bridge-session",
    "atis-latch", "ai-title", "file-history-snapshot", "file-history-delta",
    "queue-operation",
}


# ---------- 小工具 ----------

def esc(s):
    return html.escape(str(s), quote=False)


def md(text):
    """極簡 markdown：程式碼區塊、行內碼、粗體、標題、連結。"""
    text = str(text)
    blocks = []

    def stash_code(m):
        lang = (m.group(1) or "").strip()
        blocks.append(f'<pre class="code" data-lang="{esc(lang)}">'
                      f'<code>{esc(m.group(2))}</code></pre>')
        return f"\x00{len(blocks) - 1}\x00"

    text = re.sub(r"```(\w*)\n(.*?)```", stash_code, text, flags=re.S)
    text = esc(text)
    text = re.sub(r"`([^`\n]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*\n]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"^(#{1,4})\s+(.+)$",
                  lambda m: f"<h{len(m.group(1)) + 2}>{m.group(2)}</h{len(m.group(1)) + 2}>",
                  text, flags=re.M)
    text = re.sub(r"(https?://[^\s<>\"]+)", r'<a href="\1" target="_blank">\1</a>', text)
    text = text.replace("\n", "<br>")
    for i, b in enumerate(blocks):
        text = text.replace(f"\x00{i}\x00", b)
    return text


def clip(s, limit=MAX_BLOB):
    s = str(s)
    if len(s) <= limit:
        return esc(s), False
    return esc(s[:limit]), True


def ts_fmt(t):
    if not t:
        return ""
    try:
        d = datetime.datetime.fromisoformat(t.replace("Z", "+00:00"))
        return d.astimezone().strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return t


# ---------- 解析 ----------

def parse(path):
    """讀 jsonl，回傳 (事件列表, metadata)。"""
    events, meta = [], {
        "session": path.stem, "title": "", "cwd": "", "branch": "",
        "start": "", "end": "", "user_msgs": 0, "tools": 0,
    }
    tool_names = {}          # tool_use_id -> 工具名稱

    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except Exception:
                continue

            t = r.get("type")
            if r.get("aiTitle") and not meta["title"]:
                meta["title"] = r["aiTitle"]
            if r.get("cwd"):
                meta["cwd"] = r["cwd"]
            if r.get("gitBranch"):
                meta["branch"] = r["gitBranch"]
            stamp = r.get("timestamp")
            if stamp:
                meta["start"] = meta["start"] or stamp
                meta["end"] = stamp

            if t in SKIP_TYPES:
                continue

            msg = r.get("message") or {}
            content = msg.get("content")

            if t == "user":
                if isinstance(content, str):
                    if content.strip():
                        meta["user_msgs"] += 1
                        events.append(("user", content, stamp))
                elif isinstance(content, list):
                    for b in content:
                        bt = b.get("type")
                        if bt == "text" and b.get("text", "").strip():
                            meta["user_msgs"] += 1
                            events.append(("user", b["text"], stamp))
                        elif bt == "tool_result":
                            body = b.get("content")
                            if isinstance(body, list):
                                body = "\n".join(
                                    x.get("text", "") for x in body if isinstance(x, dict))
                            events.append(("result", {
                                "name": tool_names.get(b.get("tool_use_id"), "tool"),
                                "body": body or "",
                                "error": bool(b.get("is_error")),
                            }, stamp))

            elif t == "assistant" and isinstance(content, list):
                for b in content:
                    bt = b.get("type")
                    if bt == "text" and b.get("text", "").strip():
                        events.append(("assistant", b["text"], stamp))
                    elif bt == "thinking" and b.get("thinking", "").strip():
                        events.append(("thinking", b["thinking"], stamp))
                    elif bt == "tool_use":
                        tool_names[b.get("id")] = b.get("name", "tool")
                        meta["tools"] += 1
                        events.append(("tool", {
                            "name": b.get("name", "tool"),
                            "input": b.get("input", {}),
                        }, stamp))

            elif t == "system" and r.get("content"):
                events.append(("system", r["content"], stamp))

    if not meta["title"]:
        for kind, payload, _ in events:
            if kind == "user":
                meta["title"] = str(payload).strip().split("\n")[0][:60]
                break
    return events, meta


# ---------- 產生 HTML ----------

CSS = """
:root{--bg:#fbfaf9;--fg:#1f1d1b;--mut:#6b665f;--line:#e5e1db;--card:#fff;
--user:#2563eb;--asst:#7c3aed;--tool:#0f766e;--think:#a16207;--err:#dc2626;}
@media(prefers-color-scheme:dark){:root{--bg:#171614;--fg:#e8e4dd;--mut:#9a938a;
--line:#2e2b27;--card:#1f1e1b;--user:#60a5fa;--asst:#a78bfa;--tool:#2dd4bf;
--think:#d9a441;--err:#f87171;}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
font:14px/1.65 system-ui,-apple-system,"Segoe UI","Noto Sans TC",sans-serif}
header{position:sticky;top:0;z-index:5;background:var(--card);
border-bottom:1px solid var(--line);padding:12px 20px}
header h1{margin:0 0 4px;font-size:16px}
.meta{color:var(--mut);font-size:12px;display:flex;gap:14px;flex-wrap:wrap}
#q{width:100%;margin-top:10px;padding:7px 10px;border:1px solid var(--line);
border-radius:7px;background:var(--bg);color:var(--fg);font:inherit}
main{max-width:900px;margin:0 auto;padding:20px}
.ev{margin:0 0 14px;border:1px solid var(--line);border-radius:9px;
background:var(--card);overflow:hidden}
.ev>.lbl{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;
padding:7px 12px;border-bottom:1px solid var(--line);display:flex;
justify-content:space-between;gap:10px}
.ev>.body{padding:12px 14px;overflow-x:auto}
.user>.lbl{color:var(--user)} .assistant>.lbl{color:var(--asst)}
.tool>.lbl,.result>.lbl{color:var(--tool)} .thinking>.lbl{color:var(--think)}
.system>.lbl{color:var(--mut)} .result.err>.lbl{color:var(--err)}
.user{border-left:3px solid var(--user)} .assistant{border-left:3px solid var(--asst)}
.time{font-weight:400;color:var(--mut);text-transform:none;letter-spacing:0}
pre.code,pre.raw{background:var(--bg);border:1px solid var(--line);border-radius:6px;
padding:10px;overflow-x:auto;margin:8px 0;
font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
code{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
background:var(--bg);padding:1px 4px;border-radius:4px}
pre code{background:none;padding:0}
details>summary{cursor:pointer;color:var(--mut);font-size:12px;padding:2px 0}
.trunc{color:var(--err);font-size:11px;margin-top:6px}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border-bottom:1px solid var(--line);padding:7px 9px;text-align:left}
th{color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
tr:hover td{background:var(--card)}
a{color:var(--user)}
.hide{display:none}
"""

JS = """
const q=document.getElementById('q');
if(q){q.addEventListener('input',()=>{
  const v=q.value.toLowerCase();
  document.querySelectorAll('.ev,tbody tr').forEach(el=>{
    el.classList.toggle('hide', v && !el.textContent.toLowerCase().includes(v));
  });
});}
"""


def tool_summary(inp):
    """從工具參數挑出最有辨識度的一項當摘要。"""
    if not isinstance(inp, dict):
        return str(inp)[:90]
    for k in ("command", "file_path", "path", "url", "pattern", "query",
              "prompt", "description", "skill", "old_string"):
        v = inp.get(k)
        if isinstance(v, str) and v.strip():
            one = " ".join(v.split())
            return f"{k}: {one[:90]}" + ("…" if len(one) > 90 else "")
    keys = ", ".join(list(inp)[:5])
    return f"({keys})" if keys else "(無參數)"


def render_event(kind, payload, stamp):
    label = {"user": "你", "assistant": "Claude", "thinking": "思考",
             "tool": "工具呼叫", "result": "工具結果", "system": "系統"}[kind]
    time = f'<span class="time">{esc(ts_fmt(stamp))}</span>'
    cls = kind

    if kind in ("user", "assistant"):
        body = md(payload)
    elif kind == "thinking":
        txt, cut = clip(payload)
        body = (f"<details><summary>展開思考過程</summary><pre class='raw'>{txt}</pre>"
                + ("<p class='trunc'>（已截斷）</p>" if cut else "") + "</details>")
    elif kind == "system":
        txt, _ = clip(payload, 1500)
        body = f"<details><summary>系統訊息</summary><pre class='raw'>{txt}</pre></details>"
    elif kind == "tool":
        name = payload["name"]
        label = f"工具 · {esc(name)}"
        try:
            raw = json.dumps(payload["input"], ensure_ascii=False, indent=2)
        except Exception:
            raw = str(payload["input"])
        txt, cut = clip(raw)
        head = tool_summary(payload["input"])
        body = (f"<details><summary>{esc(head)}</summary><pre class='raw'>{txt}</pre>"
                + ("<p class='trunc'>（已截斷）</p>" if cut else "") + "</details>")
    else:  # result
        name = payload["name"]
        if payload["error"]:
            cls += " err"
        label = f"結果 · {esc(name)}" + ("（錯誤）" if payload["error"] else "")
        txt, cut = clip(payload["body"])
        body = (f"<details><summary>展開輸出</summary><pre class='raw'>{txt}</pre>"
                + ("<p class='trunc'>（已截斷）</p>" if cut else "") + "</details>")

    return (f'<section class="ev {cls}"><div class="lbl"><span>{label}</span>{time}</div>'
            f'<div class="body">{body}</div></section>')


def to_html(events, meta):
    rows = "\n".join(render_event(*e) for e in events)
    title = esc(meta["title"] or meta["session"][:8])
    bits = [f'{meta["user_msgs"]} 則提問', f'{meta["tools"]} 次工具呼叫']
    if meta["cwd"]:
        bits.append(esc(meta["cwd"]))
    if meta["branch"]:
        bits.append("branch: " + esc(meta["branch"]))
    bits.append(esc(ts_fmt(meta["start"])) + " → " + esc(ts_fmt(meta["end"])))
    return f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><style>{CSS}</style></head><body>
<header><h1>{title}</h1>
<div class="meta">{"".join(f"<span>{b}</span>" for b in bits)}</div>
<input id="q" placeholder="搜尋這個 session…（即時過濾）">
<div class="meta" style="margin-top:6px"><a href="../index.html">← 回索引</a></div>
</header><main>{rows}</main><script>{JS}</script></body></html>"""


def convert(jsonl: Path, outdir: Path):
    events, meta = parse(jsonl)
    if not events:
        return None
    outdir.mkdir(parents=True, exist_ok=True)
    out = outdir / (jsonl.stem + ".html")
    out.write_text(to_html(events, meta), encoding="utf-8")
    return {"path": out, "meta": meta, "size": out.stat().st_size}


def project_dir_name(path: Path) -> str:
    """把專案路徑轉成 ~/.claude/projects/ 底下的目錄名。"""
    return re.sub(r"[^a-zA-Z0-9]", "-", str(path.resolve()))


def strip_home_prefix(dirname: str) -> str:
    """索引頁顯示用：把家目錄那段前綴拿掉，只留專案本身的路徑。

    ~/.claude/projects/ 的目錄名是完整絕對路徑做過字元替換的結果，
    例如 /Users/alice/work/app → -Users-alice-work-app。這裡把
    「家目錄對應的前綴」去掉，讓索引顯示 work-app 而不是一長串。
    """
    home = re.sub(r"[^a-zA-Z0-9]", "-", str(Path.home()))
    if dirname.startswith(home):
        dirname = dirname[len(home):]
    return dirname.lstrip("-") or dirname or "?"


def build_index(root: Path = None, heading: str = "對話紀錄", flat: bool = False):
    root = root or OUTROOT
    entries = []
    for f in root.rglob("*.html"):
        if f.name == "index.html":
            continue
        rel = f.relative_to(root)
        src = PROJECTS / rel.parent / (f.stem + ".jsonl")
        m = re.search(r"<title>(.*?)</title>", f.read_text(encoding="utf-8")[:2000], re.S)
        parts = rel.parent.parts
        proj = strip_home_prefix(parts[0]) if parts else "?"
        if len(parts) > 1:                       # 子代理人的紀錄
            proj += " › " + "/".join(parts[1:])
        entries.append({
            "title": m.group(1) if m else f.stem[:8],
            "href": rel.as_posix(),
            "proj": proj,
            "mtime": src.stat().st_mtime if src.exists() else f.stat().st_mtime,
        })
    entries.sort(key=lambda e: e["mtime"], reverse=True)
    col = "" if flat else "<th>專案</th>"
    rows = "\n".join(
        f'<tr><td>{datetime.datetime.fromtimestamp(e["mtime"]).strftime("%Y-%m-%d %H:%M")}</td>'
        + ("" if flat else f'<td>{esc(e["proj"])}</td>')
        + f'<td><a href="{e["href"]}">{esc(e["title"])}</a></td></tr>'
        for e in entries)
    root.mkdir(parents=True, exist_ok=True)
    (root / "index.html").write_text(f"""<!doctype html><html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(heading)}</title><style>{CSS}</style></head><body>
<header><h1>{esc(heading)}</h1><div class="meta"><span>{len(entries)} 個 session</span></div>
<input id="q" placeholder="搜尋…"></header>
<main><table><thead><tr><th>時間</th>{col}<th>標題</th></tr></thead>
<tbody>{rows}</tbody></table></main><script>{JS}</script></body></html>""",
        encoding="utf-8")
    return len(entries)


GITIGNORE = """\
# unattended plugin 自動產生。對話紀錄是逐字稿，可能含 .env 內容、API key、
# 內部主機名，所以預設不進版控。
# 確定要 commit 的話先掃過敏感字，再把下面那行 * 刪掉——這個檔案要留著，
# 只有檔案不存在時 plugin 才會重新寫入。
*
"""


def ensure_gitignore(out, proj):
    """docs/transcripts/ 預設不進版控。

    放在資料夾自己裡面，而不是改專案根目錄的 .gitignore：不必動使用者的檔案，
    刪掉資料夾（關閉存檔）時也不會留下殘骸。已存在就不碰，使用者改過的內容優先。
    """
    gi = out / ".gitignore"
    if not gi.exists():
        gi.write_text(GITIGNORE, encoding="utf-8")
    # .gitignore 管不到已經被追蹤的檔案。早期版本沒有這個檔，有些專案已經 commit 過。
    try:
        import subprocess
        r = subprocess.run(["git", "-C", str(proj), "ls-files", "--", str(out)],
                           capture_output=True, text=True, timeout=10)
        if r.returncode == 0 and r.stdout.strip() \
                and any(l.strip() == "*" for l in gi.read_text(encoding="utf-8").splitlines()):
            print(f"⚠ {out} 已有檔案被 git 追蹤，.gitignore 對它們無效。要移出版控：\n"
                  f"  git -C {proj} rm -r --cached docs/transcripts && git -C {proj} commit",
                  file=sys.stderr)
    except Exception:
        pass


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 1

    # ── 專案模式：輸出到 <專案>/docs/transcripts/，只收這個專案 ──
    if args[0] == "--here":
        proj = Path(args[1]).resolve() if len(args) > 1 else Path.cwd()
        # 第三個參數 = 只轉這一個 session（Stop hook 用：對話進行中也要能更新，
        # 不必為了一場對話把整個專案重轉一遍）。
        only = Path(args[2]).resolve() if len(args) > 2 else None
        src = PROJECTS / project_dir_name(proj)
        out = proj / "docs" / "transcripts"
        out.mkdir(parents=True, exist_ok=True)
        ensure_gitignore(out, proj)
        if not src.is_dir():
            # 這個專案還沒有任何紀錄（全新專案、或從沒在這裡開過對話）。
            # 資料夾仍然要建——它的存在就是自動存檔的開關，hook 之後會自己填內容。
            # 這裡回 0 不回 1：/spec 會在收尾時跑這支腳本，不該因為「還沒有紀錄」
            # 就讓開關沒打開，那樣使用者走人之後整輪都不會被存下來。
            build_index(out, heading=f"{proj.name} · 對話紀錄", flat=True)
            print(f"這個專案還沒有紀錄，先建立 {out}（自動存檔已啟用）")
            return 0

        if only is not None:
            targets = [only] if only.is_file() else []
        else:
            targets = sorted(src.rglob("*.jsonl"))

        ok = 0
        for j in targets:
            try:
                sub = j.parent.relative_to(src)      # 保留 subagents/ 結構
            except ValueError:
                sub = Path(".")                      # 不在這個專案底下就平放
            try:
                if convert(j, out / sub):
                    ok += 1
            except Exception as e:
                print(f"  ✗ {j.name}: {e}", file=sys.stderr)
        n = build_index(out, heading=f"{proj.name} · 對話紀錄", flat=True)
        print(f"轉出 {ok} 個 session 到 {out}")
        print(f"索引：{out / 'index.html'}（{n} 筆）")
        return 0

    targets = []
    if args[0] == "--all":
        targets = sorted(PROJECTS.rglob("*.jsonl"))
    elif args[0] == "--project":
        targets = sorted((PROJECTS / args[1]).rglob("*.jsonl"))
    elif args[0] == "--index":
        print(f"索引已重建：{build_index()} 個 session")
        return 0
    else:
        targets = [Path(args[0])]

    ok = bytes_out = 0
    for j in targets:
        try:
            try:
                sub = j.parent.relative_to(PROJECTS)
            except ValueError:
                sub = Path(j.parent.name)
            r = convert(j, OUTROOT / sub)
        except Exception as e:
            print(f"  ✗ {j.name}: {e}", file=sys.stderr)
            continue
        if r:
            ok += 1
            bytes_out += r["size"]
            if len(targets) <= 5:
                print(f"  ✓ {r['path']}  ({r['size'] / 1024:.0f} KB)")
    n = build_index()
    print(f"轉出 {ok} 個 session（{bytes_out / 1048576:.1f} MB），索引含 {n} 筆")
    print(f"開啟：{OUTROOT / 'index.html'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
