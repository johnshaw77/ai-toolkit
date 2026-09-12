"""preset 定義與模板變數。"""

from __future__ import annotations

import pytest

from smart_scaffold.presets import PRESETS, build_variables, get_preset


def test_py_preset_的模板資料夾真的存在():
    assert (PRESETS["py"].template_dir / "pyproject.toml").is_file()


def test_app_preset_已經接上分派但還沒就緒():
    assert get_preset("app").ready is False


def test_沒有的_preset_會講清楚有哪些可用():
    with pytest.raises(KeyError, match="py"):
        get_preset("rust")


def test_模板變數會補上沒問到的埠():
    variables = build_variables({"name": "demo_tool"})
    assert variables["port"] > 0
    assert variables["description"] == "demo_tool 專案"


def test_問題的_key_都不重複():
    keys = [q.key for q in PRESETS["py"].questions]
    assert len(keys) == len(set(keys))


def test_專案名稱驗證擋掉不合法的名字():
    question = next(q for q in PRESETS["py"].questions if q.key == "name")
    assert question.validate("Demo-Tool", {}) is not None
    assert question.validate("2fast", {}) is not None
    assert question.validate("demo_tool", {}) is None


def test_名稱與描述有長度上限():
    """名稱與描述會被寫進生成出來的程式碼裡，太長會讓對方的 ruff 爆行寬。"""
    questions = {q.key: q for q in PRESETS["py"].questions}
    assert questions["name"].validate("d" * 41, {}) is not None
    assert questions["name"].validate("d" * 40, {}) is None
    assert questions["description"].validate("描" * 31, {}) is not None  # 中文算兩格
    assert questions["description"].validate("描" * 30, {}) is None
    assert questions["description"].validate("d" * 60, {}) is None
    assert questions["description"].validate("   ", {}) is not None
