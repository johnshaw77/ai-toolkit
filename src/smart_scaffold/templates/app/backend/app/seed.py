"""建立初始資料：一個管理員帳號與幾筆範例資料。

用法：``uv run python -m app.seed``。可以重複跑，已經存在的不會重建。
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.core.config import settings
from app.core.hashing import hash_password
from app.db.session import SessionLocal
from app.models.item import Item, ItemStatus
from app.models.user import User, UserRole

_SAMPLE_ITEMS = [
    ("A-001", "範例項目一", ItemStatus.ACTIVE, 12),
    ("A-002", "範例項目二", ItemStatus.DRAFT, 0),
    ("A-003", "範例項目三", ItemStatus.ARCHIVED, 5),
]


async def seed() -> None:
    async with SessionLocal() as session:
        existing = (
            await session.execute(select(User).where(User.email == settings.seed_admin_email))
        ).scalar_one_or_none()
        if existing is None:
            session.add(
                User(
                    email=settings.seed_admin_email,
                    full_name="系統管理員",
                    hashed_password=hash_password(settings.seed_admin_password),
                    role=UserRole.ADMIN,
                )
            )
            print(f"已建立管理員 {settings.seed_admin_email}")
        else:
            print(f"管理員 {settings.seed_admin_email} 已存在，略過")

        for code, name, status, quantity in _SAMPLE_ITEMS:
            found = (
                await session.execute(select(Item).where(Item.code == code))
            ).scalar_one_or_none()
            if found is None:
                session.add(Item(code=code, name=name, status=status, quantity=quantity))

        await session.commit()
    print("初始資料建立完成。")


if __name__ == "__main__":
    asyncio.run(seed())
