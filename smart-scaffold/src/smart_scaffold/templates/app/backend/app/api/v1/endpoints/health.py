"""健康檢查。部署時拿來探活的就是這兩支。"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import SessionDep

router = APIRouter()


@router.get("")
async def health() -> dict[str, str]:
    """服務本身活著嗎。不碰資料庫，所以 DB 掛了這支還是會回 200。"""
    return {"status": "ok"}


@router.get("/db")
async def health_db(session: SessionDep) -> dict[str, str]:
    """資料庫連得上嗎。"""
    await session.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}
