"""SQLite 連線與 schema。

刻意只用 stdlib 的 ``sqlite3``，不引入 ORM——這類工具的查詢都很直白，
ORM 帶來的抽象成本大於好處。

慣例：這個模組只負責「連線」與「建表」，商業邏輯放 ``items`` / ``users``。
所有對外的函式都吃一個 ``sqlite3.Connection``，**交易邊界由呼叫端決定**，
service 層才好在同一條連線裡組合多個操作，測試也才好換成暫存資料庫。
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from .config import resolve_database_path

#: 建表語句。**可以重複執行**，所以每次啟動都跑一次也沒關係。
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT    NOT NULL UNIQUE,
    full_name       TEXT    NOT NULL,
    hashed_password TEXT    NOT NULL,
    is_admin        INTEGER NOT NULL DEFAULT 0,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- scaffold:if demo
CREATE TABLE IF NOT EXISTS items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    status     TEXT    NOT NULL DEFAULT 'DRAFT',
    quantity   INTEGER NOT NULL DEFAULT 0,
    note       TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_items_name ON items (name);
-- scaffold:endif
"""


def connect(path: Path | str | None = None) -> sqlite3.Connection:
    """開一條連線。

    每條連線都要做兩件事，忘了其中一件都會在幾個月後變成難查的 bug：
    打開外鍵約束（sqlite 預設是**關的**），以及把 row_factory 設成
    ``sqlite3.Row``，這樣取值才能用欄位名而不是位置。
    """
    target = Path(path) if path is not None else resolve_database_path()
    if str(target) != ":memory:":
        target.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(target, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db(connection: sqlite3.Connection) -> None:
    """建表。可以重複執行。"""
    connection.executescript(SCHEMA)
    connection.commit()


@contextmanager
def session(path: Path | str | None = None) -> Iterator[sqlite3.Connection]:
    """開一條用完就關的連線。腳本與測試用這個。"""
    connection = connect(path)
    try:
        yield connection
    finally:
        connection.close()


def touch(connection: sqlite3.Connection, table: str, row_id: int) -> None:
    """把 ``updated_at`` 戳成現在。表名只能是程式裡寫死的常數，不接使用者輸入。"""
    connection.execute(
        f"UPDATE {table} SET updated_at = datetime('now') WHERE id = ?",  # noqa: S608
        (row_id,),
    )
