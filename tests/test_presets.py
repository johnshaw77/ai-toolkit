"""preset 定義與模板變數。"""

from __future__ import annotations

import pytest

from smart_scaffold.presets import (
    PRESETS,
    build_variables,
    database_url_for,
    get_preset,
)


def test_py_preset_的模板資料夾真的存在():
    assert (PRESETS["py"].template_dir / "pyproject.toml").is_file()


def test_app_preset_的模板資料夾也在():
    assert (PRESETS["app"].template_dir / "backend" / "pyproject.toml").is_file()
    assert get_preset("app").ready is True


def test_app_preset_前後端各有一包依賴():
    subdirs = [step.subdir for step in PRESETS["app"].install_steps]
    assert subdirs == ["backend", "frontend"]


def test_app_preset_問前後端兩個埠():
    keys = [q.key for q in PRESETS["app"].questions]
    assert "backend_port" in keys
    assert "frontend_port" in keys


def test_資料庫選擇會翻成連線字串():
    assert database_url_for("sqlite", "demo").startswith("sqlite+aiosqlite")
    assert database_url_for("postgres", "demo").startswith("postgresql+asyncpg")
    assert "demo" in database_url_for("postgres", "demo")


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


def test_選_sqlite_就不問資料庫埠():
    """只有 postgres 才需要對外開埠，sqlite 問這題是在浪費使用者的時間。"""
    from smart_scaffold.questions import ask_all

    answers = ask_all(
        PRESETS["app"].questions,
        {"name": "demo", "database": "sqlite"},
        interactive=False,
        writer=lambda _line: None,
    )
    assert "db_port" not in answers

    answers = ask_all(
        PRESETS["app"].questions,
        {"name": "demo", "database": "postgres", "db_port": 5439},
        interactive=False,
        writer=lambda _line: None,
    )
    assert answers["db_port"] == 5439
    assert ":5439/" in build_variables(answers)["database_url"]


def test_每個埠都不一樣而且容器版跟本機開發錯開():
    """兩邊要能同時跑——同機開多個專案時這是最常見的卡點。"""
    variables = build_variables(
        {"name": "demo", "backend_port": 8002, "frontend_port": 5174}
    )
    ports = [
        variables["backend_port"],
        variables["frontend_port"],
        variables["api_container_port"],
        variables["web_container_port"],
        variables["db_port"],
    ]
    assert len(set(ports)) == len(ports)


def test_選_sqlite_也會配一個沒被佔用的資料庫埠():
    """沒問不代表可以寫死 5432——那個埠在開發機上幾乎一定已經有人用了。"""
    from smart_scaffold.ports import is_port_free

    variables = build_variables({"name": "demo", "backend_port": 8002, "frontend_port": 5174})
    port = variables["db_port"]
    assert 1 <= port <= 65535
    assert is_port_free(port), f"配出來的 {port} 其實有人在用"


def test_容器裡的連線字串用服務名而不是_127():
    from smart_scaffold.presets import container_database_url_for

    assert container_database_url_for("postgres", "demo") == (
        "postgresql+asyncpg://demo:demo_dev_pw@db:5432/demo"
    )
    # sqlite 的檔案要放在掛載的 volume 上，否則容器一重建資料就沒了。
    assert container_database_url_for("sqlite", "demo") == "sqlite+aiosqlite:////data/demo.db"


def test_專案名以_pg_開頭時資料庫帳號要換掉():
    """PostgreSQL 不准角色名以 pg_ 開頭，直接拿專案名當帳號會讓 initdb 失敗。"""
    from smart_scaffold.presets import db_credentials

    assert db_credentials("demo")[0] == "demo"
    assert db_credentials("pg_tools")[0] == "app_pg_tools"
    userinfo = database_url_for("postgres", "pg_tools").split("//", 1)[1].split("@", 1)[0]
    assert userinfo == "app_pg_tools:app_pg_tools_dev_pw"
    assert not userinfo.startswith("pg_")
