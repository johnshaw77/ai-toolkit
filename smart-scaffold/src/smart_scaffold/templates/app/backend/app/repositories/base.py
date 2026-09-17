"""Repository 基底。

集中處理三件每個列表端點都要做、但每次手寫都會漏掉的事：
軟刪除過濾、排序白名單、分頁計數。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.db.base import BaseEntity

#: 分頁一次最多給幾筆。不設上限的話遲早有人打 page_size=999999。
MAX_PAGE_SIZE = 100


class BaseRepository[ModelT: BaseEntity]:
    """一個資料表一個 repository。"""

    #: 允許排序的欄位。**白名單制**——直接把使用者輸入拼進 ORDER BY 是注入。
    sortable_fields: tuple[str, ...] = ("created_at", "updated_at")

    def __init__(self, session: AsyncSession, model: type[ModelT]) -> None:
        self.session = session
        self.model = model

    def base_query(self) -> Select[tuple[ModelT]]:
        """預設查詢：只看沒被軟刪除的資料。"""
        return select(self.model).where(self.model.deleted_at.is_(None))

    async def get(self, entity_id: uuid.UUID) -> ModelT | None:
        stmt = self.base_query().where(self.model.id == entity_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    def apply_sort(self, stmt: Select[Any], sort: str | None) -> Select[Any]:
        """``-created_at`` 代表遞減。不在白名單裡的欄位直接忽略。"""
        column = None
        descending = False
        if sort:
            field = sort[1:] if sort.startswith("-") else sort
            descending = sort.startswith("-")
            if field in self.sortable_fields:
                column = getattr(self.model, field)
        if column is None:
            column = self.model.created_at
            descending = True
        ordered = column.desc() if descending else column.asc()
        # 永遠追加 id 當 tie-breaker，否則同時間建立的資料翻頁會重複或漏掉。
        return stmt.order_by(ordered, self.model.id)

    async def paginate(
        self,
        stmt: Select[Any],
        *,
        page: int = 1,
        page_size: int = 20,
        sort: str | None = None,
    ) -> tuple[list[ModelT], int]:
        """回傳 ``(這一頁的資料, 總筆數)``。"""
        page = max(page, 1)
        page_size = min(max(page_size, 1), MAX_PAGE_SIZE)

        count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
        total = (await self.session.execute(count_stmt)).scalar_one()

        stmt = self.apply_sort(stmt, sort).limit(page_size).offset((page - 1) * page_size)
        rows = list((await self.session.execute(stmt)).scalars().all())
        return rows, total

    async def add(self, entity: ModelT) -> ModelT:
        self.session.add(entity)
        await self.session.flush()
        return entity

    async def soft_delete(self, entity: ModelT) -> None:
        """軟刪除。資料還在，只是查不到了。"""
        entity.deleted_at = utcnow()
        await self.session.flush()
