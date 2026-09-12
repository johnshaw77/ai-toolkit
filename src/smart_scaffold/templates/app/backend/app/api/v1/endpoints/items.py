"""範例領域的 CRUD。

這是整支專案的**形狀範本**：列表走統一分頁、錯誤丟 AppError 子類、
寫入由 service 或端點自己 commit。做真功能時照這個形狀複製過去。
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentUser, SessionDep
from app.core.errors import ConflictError, NotFoundError
from app.models.item import Item, ItemStatus
from app.repositories.item import ItemRepository
from app.schemas.common import Page
from app.schemas.item import ItemCreate, ItemRead, ItemUpdate

router = APIRouter()


@router.get("", response_model=Page[ItemRead])
async def list_items(
    session: SessionDep,
    _user: CurrentUser,
    keyword: str | None = Query(None, description="比對代號或名稱"),
    status_filter: ItemStatus | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str | None = Query(None, description="欄位名，前面加 - 代表遞減"),
) -> Page[ItemRead]:
    repo = ItemRepository(session)
    stmt = repo.search_query(keyword=keyword, status=status_filter)
    rows, total = await repo.paginate(stmt, page=page, page_size=page_size, sort=sort)
    return Page[ItemRead](
        items=[ItemRead.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=ItemRead, status_code=status.HTTP_201_CREATED)
async def create_item(payload: ItemCreate, session: SessionDep, _user: CurrentUser) -> ItemRead:
    repo = ItemRepository(session)
    if await repo.get_by_code(payload.code):
        raise ConflictError(f"代號 {payload.code} 已經有人用了")
    item = Item(**payload.model_dump())
    await repo.add(item)
    await session.commit()
    return ItemRead.model_validate(item)


@router.get("/{item_id}", response_model=ItemRead)
async def get_item(item_id: uuid.UUID, session: SessionDep, _user: CurrentUser) -> ItemRead:
    item = await ItemRepository(session).get(item_id)
    if item is None:
        raise NotFoundError("找不到這筆資料")
    return ItemRead.model_validate(item)


@router.patch("/{item_id}", response_model=ItemRead)
async def update_item(
    item_id: uuid.UUID,
    payload: ItemUpdate,
    session: SessionDep,
    _user: CurrentUser,
) -> ItemRead:
    repo = ItemRepository(session)
    item = await repo.get(item_id)
    if item is None:
        raise NotFoundError("找不到這筆資料")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await session.commit()
    return ItemRead.model_validate(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: uuid.UUID, session: SessionDep, _user: CurrentUser) -> Response:
    repo = ItemRepository(session)
    item = await repo.get(item_id)
    if item is None:
        raise NotFoundError("找不到這筆資料")
    await repo.soft_delete(item)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
