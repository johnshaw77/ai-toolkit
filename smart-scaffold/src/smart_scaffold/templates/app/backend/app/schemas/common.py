"""所有清單端點共用的回應格式。

**不要自己發明第二種分頁格式**——前端的 ProTable 就是照這個形狀接的。
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict

from app.core.clock import as_utc


def _ensure_utc(value: object) -> object:
    """sqlite 讀回來的 datetime 沒有時區，補上 UTC 再送出去。

    少了時區的時間戳對前端是無解的：它不知道該不該換算。這裡統一補齊，
    JSON 就會帶著 ``Z`` 結尾。
    """
    if isinstance(value, datetime):
        return as_utc(value)
    return value


#: 回應用的時間型別。所有對外的時間欄位都用這個，不要直接用 datetime。
UTCDateTime = Annotated[datetime, BeforeValidator(_ensure_utc)]


class ORMModel(BaseModel):
    """可以直接從 SQLAlchemy 物件轉出來的 schema。"""

    model_config = ConfigDict(from_attributes=True)


class Page[T](BaseModel):
    """分頁回應：``{items, total, page, page_size}``。"""

    items: list[T]
    total: int
    page: int
    page_size: int
