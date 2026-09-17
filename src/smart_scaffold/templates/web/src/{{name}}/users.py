"""使用者。這一輪只需要「建立」與「查詢」，沒有管理介面。"""

from __future__ import annotations

import sqlite3

from .auth import hash_password
from .errors import ConflictError


def get(connection: sqlite3.Connection, user_id: int) -> sqlite3.Row | None:
    return connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def get_by_email(connection: sqlite3.Connection, email: str) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT * FROM users WHERE email = ?", (email.strip().lower(),)
    ).fetchone()


def create(
    connection: sqlite3.Connection,
    *,
    email: str,
    full_name: str,
    password: str,
    is_admin: bool = False,
) -> sqlite3.Row:
    email = email.strip().lower()
    if get_by_email(connection, email) is not None:
        raise ConflictError(f"{email} 已經註冊過了")
    cursor = connection.execute(
        "INSERT INTO users (email, full_name, hashed_password, is_admin)"
        " VALUES (?, ?, ?, ?)",
        (email, full_name.strip(), hash_password(password), int(is_admin)),
    )
    connection.commit()
    created = get(connection, int(cursor.lastrowid))
    assert created is not None  # noqa: S101 - 剛寫進去的，一定拿得到
    return created
