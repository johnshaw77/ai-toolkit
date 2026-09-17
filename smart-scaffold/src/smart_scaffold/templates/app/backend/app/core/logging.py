"""log 設定。啟動時呼叫一次就好。"""

from __future__ import annotations

import logging
import sys

_FORMAT = "%(asctime)s %(levelname)-8s %(name)s %(message)s"


def configure_logging(level: int = logging.INFO) -> None:
    root = logging.getLogger()
    if root.handlers:  # 已經設定過（例如 uvicorn 先設了）就不要疊上去
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_FORMAT))
    root.addHandler(handler)
    root.setLevel(level)
