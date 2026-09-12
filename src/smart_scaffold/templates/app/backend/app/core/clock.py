"""時間工具。

**一律用帶時區的 UTC。** 顯示成當地時間是前端的事，後端存 naive datetime
遲早會在跨時區或日光節約時出事。

sqlite 沒有原生的時區型別，讀回來的 datetime 會是 naive——所以任何從資料庫
拿出來的時間在比較之前都要先過 :func:`as_utc`。
"""

from __future__ import annotations

from datetime import UTC, datetime


def utcnow() -> datetime:
    """現在時間（UTC，帶時區）。"""
    return datetime.now(UTC)


def as_utc(value: datetime) -> datetime:
    """把可能是 naive 的時間當成 UTC 處理，避免 naive/aware 比較炸掉。"""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
