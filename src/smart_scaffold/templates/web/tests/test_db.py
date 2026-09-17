"""資料層。"""

from __future__ import annotations

import sqlite3

from {{name}}.db import init_db


def test_建表可以重複執行(connection: sqlite3.Connection):
    init_db(connection)
    init_db(connection)  # 再跑一次不該炸
    tables = {
        row["name"]
        for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    }
    assert "users" in tables


def test_外鍵約束是開著的(connection: sqlite3.Connection):
    """sqlite 預設把外鍵關掉，忘了開的話約束形同虛設。"""
    assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1


def test_取值可以用欄位名(connection: sqlite3.Connection):
    connection.execute(
        "INSERT INTO users (email, full_name, hashed_password) VALUES (?, ?, ?)",
        ("a@example.com", "測試", "x"),
    )
    row = connection.execute("SELECT * FROM users").fetchone()
    assert row["email"] == "a@example.com"


def test_email_不能重複(connection: sqlite3.Connection):
    values = ("a@example.com", "測試", "x")
    connection.execute(
        "INSERT INTO users (email, full_name, hashed_password) VALUES (?, ?, ?)", values
    )
    try:
        connection.execute(
            "INSERT INTO users (email, full_name, hashed_password) VALUES (?, ?, ?)", values
        )
    except sqlite3.IntegrityError:
        return
    raise AssertionError("email 的 UNIQUE 約束沒有生效")
