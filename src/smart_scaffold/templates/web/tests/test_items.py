"""範例領域的 service 層——驗證邏輯集中在這裡，所以測試也集中在這裡。"""

from __future__ import annotations

import sqlite3

import pytest

from {{name}} import items
from {{name}}.errors import ConflictError, NotFoundError, ValidationError


def _create(connection: sqlite3.Connection, code: str, **extra):
    return items.create(connection, {"code": code, "name": extra.pop("name", "測試"), **extra})


def test_建立之後查得到(connection: sqlite3.Connection):
    created = _create(connection, "A-001")
    assert items.get(connection, created["id"])["code"] == "A-001"


def test_代號重複會擋下來(connection: sqlite3.Connection):
    _create(connection, "A-001")
    with pytest.raises(ConflictError):
        _create(connection, "A-001")


@pytest.mark.parametrize(
    "payload,expected",
    [
        ({"code": "", "name": "x"}, "code"),
        ({"code": "A", "name": " "}, "name"),
        ({"code": "A", "name": "x", "status": "亂寫"}, "status"),
        ({"code": "A", "name": "x", "quantity": -1}, "quantity"),
        ({"code": "A", "name": "x", "quantity": "不是數字"}, "quantity"),
    ],
)
def test_驗證失敗的訊息會指出是哪個欄位(connection, payload, expected):
    with pytest.raises(ValidationError, match=expected):
        items.create(connection, payload)


def test_清單是統一的分頁格式(connection: sqlite3.Connection):
    for index in range(3):
        _create(connection, f"A-{index:03d}")
    page = items.search(connection, page=1, page_size=2)
    assert set(page) == {"items", "total", "page", "page_size"}
    assert page["total"] == 3
    assert len(page["items"]) == 2


def test_關鍵字同時比對代號與名稱(connection: sqlite3.Connection):
    _create(connection, "A-001", name="螺絲")
    _create(connection, "B-002", name="墊片")
    assert items.search(connection, keyword="螺絲")["total"] == 1
    assert items.search(connection, keyword="B-0")["total"] == 1


def test_排序只認白名單裡的欄位(connection: sqlite3.Connection):
    _create(connection, "B-002")
    _create(connection, "A-001")
    codes = [row["code"] for row in items.search(connection, sort="code")["items"]]
    assert codes == ["A-001", "B-002"]
    # 亂給欄位不會爆，也不會變成注入，退回預設排序。
    assert items.search(connection, sort="name; DROP TABLE items")["total"] == 2


def test_一頁最多給一百筆(connection: sqlite3.Connection):
    assert items.search(connection, page_size=9999)["page_size"] == items.MAX_PAGE_SIZE


def test_更新只動有給的欄位而且改不了代號(connection: sqlite3.Connection):
    created = _create(connection, "A-001", name="原本的名字")
    updated = items.update(connection, created["id"], {"quantity": 7, "code": "Z-999"})
    assert updated["quantity"] == 7
    assert updated["name"] == "原本的名字"
    assert updated["code"] == "A-001"


def test_刪除之後就查不到(connection: sqlite3.Connection):
    created = _create(connection, "A-001")
    items.delete(connection, created["id"])
    with pytest.raises(NotFoundError):
        items.get(connection, created["id"])
