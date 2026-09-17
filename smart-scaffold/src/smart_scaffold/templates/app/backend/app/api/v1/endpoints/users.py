"""使用者清單。示範「只有管理員能看」的端點長什麼樣。"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import AdminUser, SessionDep
from app.models.user import User
from app.repositories.base import BaseRepository
from app.schemas.common import Page
from app.schemas.user import UserRead

router = APIRouter()


class UserRepository(BaseRepository[User]):
    sortable_fields = ("email", "full_name", "role", "created_at")


@router.get("", response_model=Page[UserRead])
async def list_users(
    session: SessionDep,
    _admin: AdminUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str | None = None,
) -> Page[UserRead]:
    repo = UserRepository(session, User)
    rows, total = await repo.paginate(repo.base_query(), page=page, page_size=page_size, sort=sort)
    return Page[UserRead](
        items=[UserRead.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )
