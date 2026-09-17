"""``uv run {{name}}`` 的進入點。"""

from __future__ import annotations

import sys

from .config import load_env, load_settings, resolve_log_level, resolve_port


def main(argv: list[str] | None = None) -> int:
    """印出目前生效的設定，確認專案真的跑得起來。"""
    _ = argv if argv is not None else sys.argv[1:]
    load_env()
    settings = load_settings()
    app = settings.get("app") or {}
    name = app.get("name", "{{name}}")
    description = app.get("description", "")

    print(f"{name}：{description}" if description else str(name))
    print(f"  服務埠    {resolve_port(settings)}")
    print(f"  log 等級  {resolve_log_level(settings)}")
    print()
    print("骨架跑起來了。功能寫進 src/ 底下，測試寫進 tests/。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
