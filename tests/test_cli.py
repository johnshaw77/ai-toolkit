"""F2 逐步問答 CLI 與旗標模式。

核心要求：**旗標由問題定義自動產生**，新增一題只改一個地方。
"""

from __future__ import annotations

import io
import sys

import pytest

from smart_scaffold.cli import answers_from_args, build_parser, main
from smart_scaffold.presets import PRESETS, Preset
from smart_scaffold.questions import Question

PY_QUESTIONS = PRESETS["py"].questions


def _parse(*argv: str):
    return build_parser().parse_args(list(argv))


def _help_of(key: str = "py", presets: dict[str, Preset] | None = None) -> str:
    parser = build_parser(presets)
    return parser.preset_parsers[key].format_help()


def test_每一題都有對應的旗標():
    help_text = _help_of()
    for question in PY_QUESTIONS:
        assert "--" + question.key.replace("_", "-") in help_text


def test_新增一題之後_help_就有它():
    """旗標清單不能是手寫的第二份——加一題，``--help`` 必須自己長出來。"""
    extra = Question(key="team_name", prompt="這是新加的一題", default="平台組")
    preset = Preset(key="py", summary="測試用", questions=(*PY_QUESTIONS, extra))
    help_text = _help_of("py", {"py": preset})
    assert "--team-name" in help_text
    assert "這是新加的一題" in help_text


def test_help_包含提示文字與預設值():
    help_text = _help_of()
    assert "專案名稱" in help_text
    assert "3.12" in help_text
    assert "自動偵測" in help_text  # 埠號是算出來的
    assert "必填" in help_text  # 專案名稱沒有預設值


def test_布林題產生成對的開關旗標():
    help_text = _help_of()
    for flag in ("--install", "--no-install", "--git", "--no-git"):
        assert flag in help_text


def test_沒給的旗標不會混進答案裡():
    answers = answers_from_args(_parse("py", "--name", "demo"), PRESETS["py"])
    assert answers == {"name": "demo"}


def test_旗標值會照型別解析():
    args = _parse("py", "--name", "demo", "--port", "9100", "--no-git")
    answers = answers_from_args(args, PRESETS["py"])
    assert answers["port"] == 9100
    assert answers["git"] is False


def test_底線的_key_對應到連字號旗標():
    assert _parse("py", "--name", "demo", "--python-version", "3.13").python_version == "3.13"


def test_單選題的旗標只收清單裡的值(capsys):
    with pytest.raises(SystemExit):
        _parse("py", "--name", "demo", "--python-version", "2.7")
    assert "3.12" in capsys.readouterr().err


def test_沒給_preset_時印說明並回傳非零(capsys):
    assert main([]) == 2
    assert "PRESET" in capsys.readouterr().out


def test_還沒實作的_preset_會明確擋下來(capsys):
    assert main(["app", "--name", "demo", "--yes"]) == 2
    assert "還沒有內容" in capsys.readouterr().err


def test_非互動又缺必填項時明確報錯而不是卡住(capsys, monkeypatch, tmp_path):
    """stdin 不是 tty 的狀態下跑，缺 --name 必須立刻報錯，不得等輸入。"""
    monkeypatch.setattr(sys, "stdin", io.StringIO())
    assert main(["py", "--path", str(tmp_path / "x")]) == 2
    assert "--name" in capsys.readouterr().err


def test_旗標給齊時完全不需要互動(monkeypatch, tmp_path, capsys):
    """stdin 關閉的狀態下跑完整流程——一旦有人偷偷呼叫 input() 就會炸。"""
    monkeypatch.setattr(sys, "stdin", io.StringIO())
    target = tmp_path / "demo_tool"
    code = main(
        [
            "py",
            "--name",
            "demo_tool",
            "--path",
            str(target),
            "--port",
            "8123",
            "--no-install",
            "--no-git",
        ]
    )
    out = capsys.readouterr().out
    assert code == 0, out
    assert (target / "pyproject.toml").is_file()
    assert "/unattended:spec" in out
