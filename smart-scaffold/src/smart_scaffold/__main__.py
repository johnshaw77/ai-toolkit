"""讓 `python -m smart_scaffold` 等同於 `smart-scaffold`。"""

import sys

from .cli import main

if __name__ == "__main__":
    sys.exit(main())
