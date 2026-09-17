"""使用者。"""

from __future__ import annotations

from enum import StrEnum

from sqlalchemy import Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import BaseEntity


class UserRole(StrEnum):
    """角色。刻意只留兩種——需要細一點的權限再往上加，不要一開始就過度設計。"""

    ADMIN = "ADMIN"
    USER = "USER"


class User(BaseEntity):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    # native_enum=False：存成字串，換資料庫或加選項時不必動 DB 型別。
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, native_enum=False, length=20), default=UserRole.USER, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
