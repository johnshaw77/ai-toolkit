"""CLI。``uv run {{name}} <子命令>``。

無參數時只印設定不做事——這是刻意的，讓「跑起來看看有沒有裝好」這件事零風險。
"""

from __future__ import annotations

import argparse
import sys

from .auth import hash_password  # noqa: F401  讓 seed 的相依一眼看得到
from .config import (
    load_env,
    load_settings,
    resolve_database_path,
    resolve_host,
    resolve_log_level,
    resolve_port,
)
from .db import init_db, session
from .errors import ConflictError
# scaffold:if demo

SAMPLE_ITEMS = [
    ("A-001", "範例項目一", "ACTIVE", 12),
    ("A-002", "範例項目二", "DRAFT", 0),
    ("A-003", "範例項目三", "ARCHIVED", 5),
]
# scaffold:endif


def _show() -> int:
    settings = load_settings()
    app = settings.get("app") or {}
    name = app.get("name", "{{name}}")
    description = app.get("description", "")

    print(f"{name}：{description}" if description else str(name))
    print(f"  服務埠    {resolve_port(settings)}")
    print(f"  資料庫    {resolve_database_path(settings)}")
    print(f"  log 等級  {resolve_log_level(settings)}")
    print()
    print("可用子命令：init / seed / serve。詳見 `uv run {{name}} --help`。")
    return 0


def _init() -> int:
    with session() as connection:
        init_db(connection)
    print(f"資料表已建立：{resolve_database_path()}")
    return 0


def _seed() -> int:
    """建立初始管理員與範例資料。可以重複跑，已經存在的不會重建。"""
    import os

    from . import users

    with session() as connection:
        init_db(connection)

        email = os.environ.get("SEED_ADMIN_EMAIL", "admin@example.com")
        password = os.environ.get("SEED_ADMIN_PASSWORD", "admin1234")
        try:
            users.create(
                connection,
                email=email,
                full_name="系統管理員",
                password=password,
                is_admin=True,
            )
            print(f"已建立管理員 {email}")
        except ConflictError:
            print(f"管理員 {email} 已存在，略過")

        # scaffold:if demo
        for code, item_name, status, quantity in SAMPLE_ITEMS:
            found = connection.execute(
                "SELECT id FROM items WHERE code = ?", (code,)
            ).fetchone()
            if found is None:
                connection.execute(
                    "INSERT INTO items (code, name, status, quantity)"
                    " VALUES (?, ?, ?, ?)",
                    (code, item_name, status, quantity),
                )
        # scaffold:endif
        connection.commit()

    print("初始資料建立完成。")
    return 0


def _serve() -> int:
    import uvicorn

    settings = load_settings()
    host, port = resolve_host(settings), resolve_port(settings)
    print(f"服務啟動：http://{host}:{port}")
    uvicorn.run("{{name}}.api:create_app", factory=True, host=host, port=port)
    return 0


def main(argv: list[str] | None = None) -> int:
    load_env()
    parser = argparse.ArgumentParser(prog="{{name}}", description="{{description}}")
    sub = parser.add_subparsers(dest="command", metavar="COMMAND")
    sub.add_parser("init", help="建立資料表（可重複執行）")
    sub.add_parser("seed", help="建立初始管理員與範例資料")
    sub.add_parser("serve", help="啟動網頁服務")

    args = parser.parse_args(sys.argv[1:] if argv is None else argv)
    return {"init": _init, "seed": _seed, "serve": _serve}.get(args.command, _show)()


if __name__ == "__main__":
    sys.exit(main())
