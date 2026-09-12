"""依賴注入。端點只要寫 ``user: CurrentUser`` 就拿得到已驗證的使用者。"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import decode_access_token
from app.db.session import get_session
from app.models.user import User, UserRole

# auto_error=False：自己丟 UnauthorizedError，錯誤格式才會跟其他地方一致。
_bearer = HTTPBearer(auto_error=False)

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise UnauthorizedError("請先登入")
    payload = decode_access_token(credentials.credentials)
    try:
        user_id = uuid.UUID(str(payload.get("sub")))
    except ValueError:
        raise UnauthorizedError("憑證無效") from None

    stmt = select(User).where(User.id == user_id, User.deleted_at.is_(None))
    user = (await session.execute(stmt)).scalar_one_or_none()
    if user is None or not user.is_active:
        raise UnauthorizedError("這個帳號已停用")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: UserRole):
    """產生一個「只有這些角色能進來」的依賴。"""

    async def _guard(user: CurrentUser) -> User:
        if user.role not in roles:
            raise ForbiddenError("權限不足")
        return user

    return _guard


AdminUser = Annotated[User, Depends(require_roles(UserRole.ADMIN))]
