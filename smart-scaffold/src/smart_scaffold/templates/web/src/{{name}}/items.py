"""範例領域：品項。

這是**故意寫得很中性**的示範，用來撐起列表、搜尋、分頁、CRUD 的骨架。
開始做真正的功能時，把它整組換掉（這個檔案、``templates/items.html``、
``static/items.js``、以及 ``api.py`` 裡對應的那一段）。

慣例：所有函式吃 ``sqlite3.Connection``，**交易邊界由呼叫端決定**。
"""

from __future__ import annotations

import sqlite3
from typing import Any

from .db import touch
from .errors import ConflictError, NotFoundError, ValidationError

#: 狀態與它給人看的名字。**這是唯一來源**——前端的標籤是從這裡送過去的，
#: 不要在 JS 裡再抄一份，兩邊遲早會不一致。
STATUS_LABELS: dict[str, str] = {
    "DRAFT": "草稿",
    "ACTIVE": "啟用",
    "ARCHIVED": "封存",
}

STATUSES: tuple[str, ...] = tuple(STATUS_LABELS)

#: 允許排序的欄位。**白名單制**——把使用者輸入拼進 ORDER BY 就是 SQL 注入。
SORTABLE: tuple[str, ...] = ("code", "name", "status", "quantity", "created_at")

#: 一頁最多幾筆。不設上限的話遲早有人打 page_size=999999。
MAX_PAGE_SIZE = 100


def _order_clause(sort: str | None) -> str:
    """``-created_at`` 代表遞減。不在白名單裡的一律退回預設排序。"""
    field, descending = (sort[1:], True) if sort and sort.startswith("-") else (sort, False)
    if field not in SORTABLE:
        field, descending = "created_at", True
    # id 當 tie-breaker，否則同秒建立的資料翻頁會重複或漏掉。
    return f"ORDER BY {field} {'DESC' if descending else 'ASC'}, id ASC"


def validate(payload: dict[str, Any], *, partial: bool = False) -> dict[str, Any]:
    """檢查並正規化輸入。驗證集中在這裡，API 層只負責轉換。"""
    cleaned: dict[str, Any] = {}

    if not partial or "code" in payload:
        code = str(payload.get("code", "")).strip()
        if not code:
            raise ValidationError("code：代號不能空白")
        if len(code) > 50:
            raise ValidationError("code：代號最多 50 個字")
        cleaned["code"] = code

    if not partial or "name" in payload:
        name = str(payload.get("name", "")).strip()
        if not name:
            raise ValidationError("name：名稱不能空白")
        if len(name) > 200:
            raise ValidationError("name：名稱最多 200 個字")
        cleaned["name"] = name

    if "status" in payload and payload["status"] is not None:
        status = str(payload["status"]).strip().upper()
        if status not in STATUSES:
            raise ValidationError("status：只能是 " + " / ".join(STATUSES))
        cleaned["status"] = status

    if "quantity" in payload and payload["quantity"] is not None:
        try:
            quantity = int(payload["quantity"])
        except (TypeError, ValueError):
            raise ValidationError("quantity：要是整數") from None
        if quantity < 0:
            raise ValidationError("quantity：不能是負數")
        cleaned["quantity"] = quantity

    if "note" in payload:
        note = payload["note"]
        cleaned["note"] = str(note).strip() or None if note is not None else None

    return cleaned


def search(
    connection: sqlite3.Connection,
    *,
    keyword: str | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
    sort: str | None = None,
) -> dict[str, Any]:
    """回傳統一的分頁格式 ``{items, total, page, page_size}``。

    **不要自己發明第二種分頁格式**——前端的表格就是照這個形狀接的。
    """
    page = max(int(page), 1)
    page_size = min(max(int(page_size), 1), MAX_PAGE_SIZE)

    where = ["1 = 1"]
    params: list[Any] = []
    if keyword:
        where.append("(code LIKE ? OR name LIKE ?)")
        pattern = f"%{keyword.strip()}%"
        params += [pattern, pattern]
    if status:
        where.append("status = ?")
        params.append(status.upper())
    clause = " AND ".join(where)

    total = connection.execute(
        f"SELECT COUNT(*) AS n FROM items WHERE {clause}",  # noqa: S608 - clause 全是常數
        params,
    ).fetchone()["n"]

    rows = connection.execute(
        f"SELECT * FROM items WHERE {clause} {_order_clause(sort)} LIMIT ? OFFSET ?",  # noqa: S608
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()

    return {
        "items": [dict(row) for row in rows],
        "total": int(total),
        "page": page,
        "page_size": page_size,
    }


def get(connection: sqlite3.Connection, item_id: int) -> dict[str, Any]:
    row = connection.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        raise NotFoundError("找不到這筆資料")
    return dict(row)


def create(connection: sqlite3.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    data = validate(payload)
    existing = connection.execute(
        "SELECT id FROM items WHERE code = ?", (data["code"],)
    ).fetchone()
    if existing is not None:
        raise ConflictError(f"代號 {data['code']} 已經有人用了")

    cursor = connection.execute(
        "INSERT INTO items (code, name, status, quantity, note) VALUES (?, ?, ?, ?, ?)",
        (
            data["code"],
            data["name"],
            data.get("status", "DRAFT"),
            data.get("quantity", 0),
            data.get("note"),
        ),
    )
    connection.commit()
    return get(connection, int(cursor.lastrowid))


def update(connection: sqlite3.Connection, item_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    get(connection, item_id)  # 不存在就直接 404
    data = validate(payload, partial=True)
    data.pop("code", None)  # 代號是識別用的，建立之後不給改
    if not data:
        return get(connection, item_id)

    assignments = ", ".join(f"{field} = ?" for field in data)
    connection.execute(
        f"UPDATE items SET {assignments} WHERE id = ?",  # noqa: S608 - 欄位名來自 validate
        [*data.values(), item_id],
    )
    touch(connection, "items", item_id)
    connection.commit()
    return get(connection, item_id)


def delete(connection: sqlite3.Connection, item_id: int) -> None:
    get(connection, item_id)
    connection.execute("DELETE FROM items WHERE id = ?", (item_id,))
    connection.commit()
