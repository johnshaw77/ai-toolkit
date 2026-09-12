"""登入、換票、登出。

refresh token 採**輪替**：每次換票就作廢舊的、發一張新的，並記下
``replaced_by_id``。如果有人拿已經作廢的票來換，代表票外流了——這時把整條鏈
一起作廢，強迫重新登入。只廢那一條鏈，其他裝置不受影響。
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import as_utc
from app.core.errors import UnauthorizedError
from app.core.hashing import verify_password
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    now,
    refresh_token_expiry,
)
from app.models.auth import RefreshToken
from app.models.user import User


async def _issue_tokens(
    session: AsyncSession,
    user: User,
    *,
    user_agent: str | None = None,
) -> tuple[str, str, int]:
    access_token, expires_in = create_access_token(str(user.id), user.role.value)
    raw_refresh, token_hash = generate_refresh_token()
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=refresh_token_expiry(),
            user_agent=(user_agent or "")[:255] or None,
        )
    )
    await session.flush()
    return access_token, raw_refresh, expires_in


async def authenticate(session: AsyncSession, email: str, password: str) -> User:
    stmt = select(User).where(User.email == email, User.deleted_at.is_(None))
    user = (await session.execute(stmt)).scalar_one_or_none()
    hashed = user.hashed_password if user else None
    if not verify_password(password, hashed) or user is None:
        # 帳號不存在與密碼錯誤回同一句話，不要洩漏哪些 email 有註冊。
        raise UnauthorizedError("帳號或密碼不正確")
    if not user.is_active:
        raise UnauthorizedError("這個帳號已停用")
    return user


async def login(
    session: AsyncSession,
    email: str,
    password: str,
    *,
    user_agent: str | None = None,
) -> tuple[User, str, str, int]:
    user = await authenticate(session, email, password)
    access_token, raw_refresh, expires_in = await _issue_tokens(
        session, user, user_agent=user_agent
    )
    await session.commit()
    return user, access_token, raw_refresh, expires_in


async def _revoke_chain(session: AsyncSession, token: RefreshToken) -> None:
    """沿著 replaced_by_id 把整條鏈作廢。"""
    current: RefreshToken | None = token
    seen: set[uuid.UUID] = set()
    while current is not None and current.id not in seen:
        seen.add(current.id)
        if current.revoked_at is None:
            current.revoked_at = now()
        next_id = current.replaced_by_id
        if next_id is None:
            break
        current = (
            await session.execute(select(RefreshToken).where(RefreshToken.id == next_id))
        ).scalar_one_or_none()


async def rotate(
    session: AsyncSession,
    raw_refresh: str,
    *,
    user_agent: str | None = None,
) -> tuple[User, str, str, int]:
    stmt = select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_refresh))
    token = (await session.execute(stmt)).scalar_one_or_none()
    if token is None:
        raise UnauthorizedError("憑證無效，請重新登入")

    if token.revoked_at is not None:
        await _revoke_chain(session, token)
        await session.commit()
        raise UnauthorizedError("憑證已被使用過，請重新登入")

    # sqlite 讀回來的是 naive datetime，先當成 UTC 再比，否則 TypeError。
    if as_utc(token.expires_at) <= now():
        raise UnauthorizedError("憑證已過期，請重新登入")

    user = (
        await session.execute(
            select(User).where(User.id == token.user_id, User.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        raise UnauthorizedError("這個帳號已停用")

    access_token, new_raw, expires_in = await _issue_tokens(
        session, user, user_agent=user_agent
    )
    new_token = (
        await session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(new_raw))
        )
    ).scalar_one()
    token.revoked_at = now()
    token.replaced_by_id = new_token.id
    await session.commit()
    return user, access_token, new_raw, expires_in


async def logout(session: AsyncSession, raw_refresh: str) -> None:
    """登出一定要作廢 refresh token，否則票還是有效的。"""
    stmt = select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_refresh))
    token = (await session.execute(stmt)).scalar_one_or_none()
    if token is not None and token.revoked_at is None:
        token.revoked_at = now()
        await session.commit()
