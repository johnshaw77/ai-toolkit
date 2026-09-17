"""範例領域模型。

這是**故意寫得很中性**的示範資料表，用來撐起列表、分頁、搜尋、CRUD 的骨架。
開始做真正的功能時，把它換成你的領域模型，連同 schema、repository、endpoint
與前端的 ItemsView 一起換掉。
"""

from __future__ import annotations

from enum import StrEnum

from sqlalchemy import Enum, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import BaseEntity


class ItemStatus(StrEnum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"


class Item(BaseEntity):
    __tablename__ = "items"

    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), index=True, nullable=False)
    status: Mapped[ItemStatus] = mapped_column(
        Enum(ItemStatus, native_enum=False, length=20), default=ItemStatus.DRAFT, nullable=False
    )
    quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, default=None)
