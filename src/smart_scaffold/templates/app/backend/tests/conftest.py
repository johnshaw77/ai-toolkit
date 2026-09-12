"""測試共用設定。

每個測試都用一份**全新的記憶體資料庫**，測試之間不會互相污染，也不需要
先起 docker。真的要測 PostgreSQL 專屬行為時再另外開一組 fixture。
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.deps import get_current_user
from app.core.hashing import hash_password
from app.db.base import Base
from app.db.session import get_session
from app.main import app
from app.models.user import User, UserRole

TEST_DATABASE_URL = "sqlite+aiosqlite://"


@pytest.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    async with maker() as db:
        yield db
    await engine.dispose()


@pytest.fixture
async def admin(session: AsyncSession) -> User:
    user = User(
        email="admin@example.com",
        full_name="測試管理員",
        hashed_password=hash_password("admin1234"),
        role=UserRole.ADMIN,
    )
    session.add(user)
    await session.commit()
    return user


@pytest.fixture
async def client(session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """沒有登入的 client。"""

    async def _session_override() -> AsyncGenerator[AsyncSession, None]:
        yield session

    app.dependency_overrides[get_session] = _session_override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        yield http
    app.dependency_overrides.clear()


@pytest.fixture
async def auth_client(client: AsyncClient, admin: User) -> AsyncGenerator[AsyncClient, None]:
    """已經以管理員身分登入的 client。"""

    async def _user_override() -> User:
        return admin

    app.dependency_overrides[get_current_user] = _user_override
    yield client
    app.dependency_overrides.pop(get_current_user, None)
