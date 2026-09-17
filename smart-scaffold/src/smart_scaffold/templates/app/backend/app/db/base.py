"""ORM 基底。

所有資料表都繼承 :class:`BaseEntity`：UUID 主鍵、建立/更新時間、軟刪除。
軟刪除的意思是「查詢預設看不到」，不是真的 DELETE——紀錄型系統別亂刪資料。
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, MetaData, Uuid, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.clock import utcnow

#: 固定索引與約束的命名，alembic autogenerate 才不會每次都產生無意義的 diff。
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class UUIDPrimaryKeyMixin:
    # 在 Python 端產生，這樣還沒 flush 就拿得到 id，寫關聯時方便得多。
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    # 時間戳在 Python 端產生，不要用 SQL 的 func.now() 當 onupdate——那會讓
    # SQLAlchemy 在 UPDATE 之後回頭再查一次資料庫，在 async 情境下直接炸
    # MissingGreenlet。server_default 留著是為了讓手動下 SQL 也有值。
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        server_default=func.now(),
        nullable=False,
    )


class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class BaseEntity(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __abstract__ = True
