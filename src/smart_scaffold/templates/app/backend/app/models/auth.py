"""refresh token 的存放。資料庫裡只有雜湊，沒有原始值。"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import BaseEntity


class RefreshToken(BaseEntity):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    # 輪替後指向新的那一張票，用來在偵測到重用時把整條鏈一起作廢。
    replaced_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, default=None)
    user_agent: Mapped[str | None] = mapped_column(String(255), default=None)
