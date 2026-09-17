"""健康檢查。服務起不來的話這兩支會先紅。"""

from __future__ import annotations

from httpx import AsyncClient


async def test_健康檢查回_ok(client: AsyncClient):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_資料庫健康檢查連得上(client: AsyncClient):
    response = await client.get("/api/v1/health/db")
    assert response.status_code == 200
    assert response.json()["database"] == "ok"
