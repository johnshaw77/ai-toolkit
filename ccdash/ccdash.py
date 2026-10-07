#!/usr/bin/env python3
"""ccdash - 多機器 Claude Code session 儀表板

三種模式（同一個檔案）：
  hook   由 Claude Code hooks 呼叫，把狀態 POST 到 collector（只用標準庫，失敗不影響 Claude）
  serve  collector，收集所有機器的狀態（只用標準庫）
  tui    終端儀表板（需要 `pip install rich`）

環境變數：
  CCDASH_SERVER  collector 位址，預設 http://127.0.0.1:7777
  CCDASH_TOKEN   共用密碼（可選，建議設）
  CCDASH_HOST    顯示用機器名稱，預設為 hostname
"""
import argparse
import hmac
import ipaddress
import json
import os
import re
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SERVER = os.environ.get("CCDASH_SERVER", "http://127.0.0.1:7777").rstrip("/")
TOKEN = os.environ.get("CCDASH_TOKEN", "")
HOST = os.environ.get("CCDASH_HOST") or socket.gethostname().split(".")[0]

# hook 事件 -> 狀態（None = 忽略）
STATE_BY_EVENT = {
    "SessionStart": "idle",
    "UserPromptSubmit": "working",
    "PreToolUse": "working",
    "PostToolUse": "working",
    "Notification": "waiting",
    "Stop": "idle",
    "SessionEnd": "ended",
}
STALE_AFTER = 300  # 工作中但超過這麼多秒沒任何事件 -> 標示疑似卡住
PRUNE_AFTER = 12 * 3600  # collector 清掉超過這麼久沒更新的 session


# ───────────────────────── hook ─────────────────────────
# 指令裡看起來像金鑰的部分：KEY=xxx、--token xxx、Bearer xxx、很長的亂碼
_SECRET_PATTERNS = [
    # Bearer 要最先處理，不然會被下一條把「Bearer」當成值換掉，真正的 token 反而留下
    (re.compile(r"(\bBearer\s+)\S+", re.I), r"\1***"),
    (re.compile(r"(\b[A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|AUTH)[A-Za-z0-9_]*\s*[=:]\s*)(\"[^\"]*\"|'[^']*'|\S+)", re.I), r"\1***"),
    (re.compile(r"(--?(?:key|token|secret|password|passwd|auth|api-key)[= ]\s*)(\S+)", re.I), r"\1***"),
    (re.compile(r"\b[A-Za-z0-9+/_=\-]{32,}\b"), "***"),
]


def _redact(text):
    for pattern, repl in _SECRET_PATTERNS:
        text = pattern.sub(repl, text)
    return text


def _tool_detail(data):
    ti = data.get("tool_input") or {}
    name = data.get("tool_name", "")
    if name == "Bash":
        # 指令會送到 collector 並寫進狀態檔，先遮掉像金鑰的部分再截短
        return _redact((ti.get("command") or "").replace("\n", " "))[:60]
    for k in ("file_path", "path", "pattern", "url", "query"):
        if ti.get(k):
            return os.path.basename(str(ti[k])) if k == "file_path" else _redact(str(ti[k]))[:60]
    return ""


def _is_idle_notice(data):
    """閒置提醒（等你輸入）不是在等授權，視為 idle。優先看 notification_type，訊息文字當備用。"""
    if data.get("notification_type") == "idle_prompt":
        return True
    return "waiting for your input" in (data.get("message") or "").lower()


def cmd_hook():
    """解析事件後交給背景子行程送出，自己立刻結束：collector 連不到（例如機器睡著）也不拖慢 Claude。"""
    try:
        data = json.loads(sys.stdin.read() or "{}")
    except Exception:
        return
    ev = data.get("hook_event_name", "")
    state = STATE_BY_EVENT.get(ev)
    if state is None:
        return
    msg = data.get("message", "") if ev == "Notification" else ""
    if ev == "Notification" and _is_idle_notice(data):
        state = "idle"

    cwd = data.get("cwd") or ""
    rec = {
        "host": HOST,
        "session_id": data.get("session_id", ""),
        "project": cwd.rstrip("/\\").replace("\\", "/").split("/")[-1] or cwd,
        "cwd": cwd,
        "event": ev,
        "state": state,
        "tool": data.get("tool_name", "") if ev in ("PreToolUse", "PostToolUse") else "",
        "detail": _tool_detail(data) if ev in ("PreToolUse", "PostToolUse") else msg[:80],
        "tmux": "",
        "ts": time.time(),
    }
    _spawn_post(rec)


def _spawn_post(rec):
    """在背景啟動 `ccdash.py _post`，把紀錄從 stdin 交給它，不等它結束。"""
    kwargs = {"stdin": subprocess.PIPE, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
    if os.name == "nt":
        kwargs["creationflags"] = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    try:
        child = subprocess.Popen([sys.executable, os.path.abspath(__file__), "_post"], **kwargs)
        child.stdin.write(json.dumps(rec).encode())
        child.stdin.close()
    except Exception:
        pass


def cmd_post():
    """背景子行程：補上 tmux 位置後 POST 給 collector；失敗就算了。"""
    try:
        rec = json.loads(sys.stdin.read() or "{}")
    except Exception:
        return
    pane = os.environ.get("TMUX_PANE")
    if pane:
        try:
            rec["tmux"] = subprocess.run(
                ["tmux", "display-message", "-p", "-t", pane, "#S:#I.#P"],
                capture_output=True, text=True, timeout=1,
            ).stdout.strip()
        except Exception:
            pass
    try:
        req = urllib.request.Request(
            SERVER + "/event",
            data=json.dumps(rec).encode(),
            headers={"Content-Type": "application/json", "X-Token": TOKEN},
        )
        urllib.request.urlopen(req, timeout=5).read()
    except Exception:
        pass  # collector 不在也不能拖累 Claude


# ───────────────────────── collector ─────────────────────────
VALID_STATES = {"idle", "working", "waiting", "ended"}
MAX_BODY = 64 * 1024  # 一筆事件不到 1 KB，64 KB 已經很寬


def _clean_record(raw):
    """檢查 hook 送來的紀錄；格式不對就丟 ValueError（回 400），免得舊版 hook 的資料把 TUI 弄當。"""
    if not isinstance(raw, dict):
        raise ValueError("not an object")
    host, sid, state = raw.get("host"), raw.get("session_id"), raw.get("state")
    if not isinstance(host, str) or not host or not isinstance(sid, str) or not sid:
        raise ValueError("host and session_id are required")
    if state not in VALID_STATES:
        raise ValueError(f"unknown state: {state!r}")
    text = lambda k, n: str(raw.get(k) or "")[:n]  # noqa: E731
    return {
        "host": host[:64],
        "session_id": sid[:128],
        "project": text("project", 120),
        "cwd": text("cwd", 400),
        "event": text("event", 40),
        "state": state,
        "tool": text("tool", 80),
        "detail": text("detail", 120),
        "tmux": text("tmux", 80),
        # 時間由 collector 收到時蓋章，各台機器的時鐘差多少都不影響「持續」和「疑似卡住」
        "ts": time.time(),
    }


def _is_loopback(bind):
    try:
        return ipaddress.ip_address(bind).is_loopback
    except ValueError:
        return bind == "localhost"


class Store:
    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        self.sessions = {}
        try:
            with open(path) as f:
                saved = json.load(f)
            # 舊版存下的壞資料直接丟掉
            self.sessions = {
                k: v for k, v in saved.items()
                if isinstance(v, dict) and v.get("state") in VALID_STATES
                and isinstance(v.get("ts"), (int, float)) and isinstance(v.get("since"), (int, float))
            }
        except Exception:
            pass

    def update(self, rec):
        key = f"{rec['host']}/{rec['session_id']}"
        with self.lock:
            if rec["state"] == "ended":
                self.sessions.pop(key, None)
            else:
                prev = self.sessions.get(key)
                rec["since"] = prev.get("since", rec["ts"]) if prev and prev.get("state") == rec["state"] else rec["ts"]
                if prev and not rec["tmux"]:
                    rec["tmux"] = prev.get("tmux", "")
                if prev and rec["state"] == "working" and not rec["tool"] and rec["event"] == "UserPromptSubmit":
                    rec["tool"], rec["detail"] = "", "thinking"
                self.sessions[key] = rec
            self._save()

    def snapshot(self):
        now = time.time()
        with self.lock:
            for k in [k for k, v in self.sessions.items() if now - v["ts"] > PRUNE_AFTER]:
                del self.sessions[k]
            return list(self.sessions.values())

    def _save(self):
        try:
            tmp = self.path + ".tmp"
            with open(tmp, "w") as f:
                json.dump(self.sessions, f)
            os.replace(tmp, self.path)
        except Exception:
            pass


def cmd_serve(args):
    store = Store(os.path.expanduser(args.state))

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _ok(self):
            given = self.headers.get("X-Token") or ""
            if TOKEN and not hmac.compare_digest(given.encode(), TOKEN.encode()):
                self.send_response(401)
                self.end_headers()
                return False
            return True

        def do_POST(self):
            if not self._ok():
                return
            try:
                n = int(self.headers.get("Content-Length", 0))
            except ValueError:
                n = -1
            if n < 0 or n > MAX_BODY:
                self.send_response(413)
                self.end_headers()
                return
            try:
                store.update(_clean_record(json.loads(self.rfile.read(n))))
                self.send_response(204)
            except Exception:
                self.send_response(400)
            self.end_headers()

        def do_GET(self):
            if not self._ok():
                return
            # 附上 collector 的現在時間，TUI 用它算「持續」，不受 TUI 那台的時鐘影響
            body = json.dumps({"now": time.time(), "sessions": store.snapshot()}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    if not TOKEN and not _is_loopback(args.bind):
        sys.exit(
            f"拒絕在 {args.bind} 上不設密碼對外開放：請先設定 CCDASH_TOKEN，"
            "或只綁本機（--bind 127.0.0.1）。建議綁 Tailscale IP：--bind $(tailscale ip -4)"
        )
    srv = ThreadingHTTPServer((args.bind, args.port), H)
    print(f"ccdash collector on {args.bind}:{args.port}  (token {'ON' if TOKEN else 'OFF'})")
    srv.serve_forever()


# ───────────────────────── tui ─────────────────────────
def _fmt(sec):
    sec = int(max(sec, 0))
    if sec < 60:
        return f"{sec}s"
    if sec < 3600:
        return f"{sec // 60}m{sec % 60:02d}s"
    return f"{sec // 3600}h{sec % 3600 // 60:02d}m"


def cmd_tui(args):
    try:
        from rich.console import Console, Group
        from rich.live import Live
        from rich.table import Table
        from rich.text import Text
    except ImportError:
        sys.exit("TUI 需要 rich：pip install rich")

    console = Console()
    order = {"waiting": 0, "working": 1, "stale": 2, "idle": 3}
    style = {
        "waiting": ("🟡 等你", "bold yellow"),
        "working": ("🟢 工作中", "green"),
        "stale": ("🔴 疑似卡住", "red"),
        "idle": ("⚪ 閒置", "dim"),
    }
    seen_waiting = set()

    def fetch():
        """回傳 (collector 的現在時間, sessions)；舊版 collector 只回 list，就用本機時間。"""
        req = urllib.request.Request(SERVER + "/", headers={"X-Token": TOKEN})
        data = json.loads(urllib.request.urlopen(req, timeout=3).read())
        if isinstance(data, list):
            return time.time(), data
        return float(data.get("now") or time.time()), list(data.get("sessions") or [])

    def num(value, default):
        return value if isinstance(value, (int, float)) else default

    def render():
        try:
            now, raw = fetch()
        except urllib.error.HTTPError as e:
            hint = "密碼不對：檢查 CCDASH_TOKEN 跟 collector 是否一樣" if e.code == 401 else f"HTTP {e.code}"
            return Text(f"collector {SERVER} 拒絕了：{hint}", style="red")
        except Exception as e:
            return Text(f"連不上 collector {SERVER}：{e}", style="red")
        # 欄位缺了或不認得的狀態都不讓畫面當掉
        rows = []
        for r in raw:
            if not isinstance(r, dict):
                continue
            state = r.get("state") if r.get("state") in order else "idle"
            ts = num(r.get("ts"), now)
            rows.append({
                "host": str(r.get("host") or "?"),
                "project": str(r.get("project") or "?"),
                "session_id": str(r.get("session_id") or ""),
                "tool": str(r.get("tool") or ""),
                "detail": str(r.get("detail") or ""),
                "tmux": str(r.get("tmux") or ""),
                "ts": ts,
                "since": num(r.get("since"), ts),
                "_state": "stale" if state == "working" and now - ts > STALE_AFTER else state,
            })
        rows.sort(key=lambda r: (order[r["_state"]], r["host"], r["project"]))

        # 新出現「等你」時響鈴
        cur = {f"{r['host']}/{r['session_id']}" for r in rows if r["_state"] == "waiting"}
        if cur - seen_waiting:
            console.bell()
        seen_waiting.clear()
        seen_waiting.update(cur)

        counts = {k: sum(1 for r in rows if r["_state"] == k) for k in order}
        head = Text(
            f"🟡 {counts['waiting']} 等你   🟢 {counts['working']} 工作中   "
            f"🔴 {counts['stale']} 疑似卡住   ⚪ {counts['idle']} 閒置      "
            f"{time.strftime('%H:%M:%S')}",
            style="bold",
        )
        t = Table(expand=True, header_style="bold cyan")
        for c in ("機器", "專案", "狀態", "持續", "正在做什麼", "tmux", "session"):
            t.add_column(c, overflow="ellipsis", no_wrap=True)
        for r in rows:
            label, st = style[r["_state"]]
            doing = " ".join(x for x in (r["tool"], r["detail"]) if x)
            t.add_row(
                r["host"], r["project"], Text(label, style=st),
                _fmt(now - r["since"]), doing, r["tmux"], r["session_id"][:8],
            )
        return Group(head, t)

    with Live(render(), console=console, refresh_per_second=2, screen=True) as live:
        try:
            while True:
                time.sleep(args.interval)
                live.update(render())
        except KeyboardInterrupt:
            pass


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="mode", required=True, metavar="{hook,serve,tui}")
    sub.add_parser("hook")
    sub.add_parser("_post", help=argparse.SUPPRESS)  # hook 在背景啟動的子行程
    s = sub.add_parser("serve")
    s.add_argument("--bind", default="127.0.0.1", help="預設只綁本機；給其他機器連請用 Tailscale IP")
    s.add_argument("--port", type=int, default=7777)
    s.add_argument("--state", default="~/.ccdash-state.json")
    t = sub.add_parser("tui")
    t.add_argument("--interval", type=float, default=1.0)
    args = ap.parse_args()
    if args.mode in ("hook", "_post"):
        try:
            cmd_hook() if args.mode == "hook" else cmd_post()
        except Exception:
            pass
        sys.exit(0)
    elif args.mode == "serve":
        cmd_serve(args)
    else:
        cmd_tui(args)


if __name__ == "__main__":
    main()
