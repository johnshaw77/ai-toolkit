"""範例領域的 schema。換成真正的領域時整份換掉。"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.models.item import ItemStatus
from app.schemas.common import ORMModel, UTCDateTime


class ItemCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    status: ItemStatus = ItemStatus.DRAFT
    quantity: int = Field(default=0, ge=0)
    note: str | None = None


class ItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    status: ItemStatus | None = None
    quantity: int | None = Field(default=None, ge=0)
    note: str | None = None


class ItemRead(ORMModel):
    id: uuid.UUID
    code: str
    name: str
    status: ItemStatus
    quantity: int
    note: str | None
    created_at: UTCDateTime
    updated_at: UTCDateTime
