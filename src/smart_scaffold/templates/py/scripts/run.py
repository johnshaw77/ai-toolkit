#!/usr/bin/env python3
"""手動跑一次：``uv run python scripts/run.py``。

跟 console script 做的事一樣。留這支是因為 scripts/ 底下通常會長出一次性的
維運腳本，這裡先給一個可以照抄的樣子。
"""

from __future__ import annotations

import sys

from {{name}}.__main__ import main

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
