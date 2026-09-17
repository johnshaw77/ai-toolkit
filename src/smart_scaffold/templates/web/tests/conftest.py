"""測試共用設定。

每個測試都用一份**全新的暫存資料庫**，測試之間不會互相污染，也不需要先跑
任何準備指令。
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from {{name}} import users
from {{name}}.api import create_app, get_db
from {{name}}.auth import SESSION_COOKIE, sign_session
from {{name}}.db import connect, init_db


@pytest.fixture
def db_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """把資料庫指到暫存檔，順便確保測試不會碰到開發用的那一份。"""
    path = tmp_path / "test.db"
    monkeypatch.setenv("DATABASE_PATH", str(path))
    return path


@pytest.fixture
def connection(db_path: Path) -> Iterator[sqlite3.Connection]:
    conn = connect(db_path)
    init_db(conn)
    try:
        yield conn
    finally:
        conn.close()


@pytest.fixture
def admin(connection: sqlite3.Connection) -> sqlite3.Row:
    return users.create(
        connection,
        email="admin@example.com",
        full_name="測試管理員",
        password="admin1234",
        is_admin=True,
    )


@pytest.fixture
def client(connection: sqlite3.Connection) -> Iterator[TestClient]:
    """沒有登入的 client。所有請求共用測試用的那條連線。"""
    app = create_app()
    app.dependency_overrides[get_db] = lambda: connection
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def auth_client(client: TestClient, admin: sqlite3.Row) -> TestClient:
    """已經登入的 client。直接塞一個簽好的 cookie，不必真的走登入表單。"""
    client.cookies.set(SESSION_COOKIE, sign_session(int(admin["id"])))
    return client
