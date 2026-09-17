"""範例領域的 repository。"""

from __future__ import annotations

from sqlalchemy import Select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.item import Item, ItemStatus
from app.repositories.base import BaseRepository


class ItemRepository(BaseRepository[Item]):
    sortable_fields = ("code", "name", "status", "quantity", "created_at", "updated_at")

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Item)

    def search_query(
        self,
        *,
        keyword: str | None = None,
        status: ItemStatus | None = None,
    ) -> Select[tuple[Item]]:
        stmt = self.base_query()
        if keyword:
            pattern = f"%{keyword.strip()}%"
            stmt = stmt.where(or_(Item.code.ilike(pattern), Item.name.ilike(pattern)))
        if status is not None:
            stmt = stmt.where(Item.status == status)
        return stmt

    async def get_by_code(self, code: str) -> Item | None:
        stmt = self.base_query().where(Item.code == code)
        return (await self.session.execute(stmt)).scalar_one_or_none()
