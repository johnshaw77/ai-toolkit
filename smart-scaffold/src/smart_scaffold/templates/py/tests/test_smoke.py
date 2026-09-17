"""最基本的煙霧測試：套件 import 得進來、entry point 跑得動。"""

from __future__ import annotations

import {{name}}
from {{name}}.__main__ import main


def test_套件有版本號():
    assert {{name}}.__version__


def test_entry_point_回傳零(capsys):
    assert main([]) == 0
    assert "{{name}}" in capsys.readouterr().out
