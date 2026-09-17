"""範例領域的 CRUD 與分頁。換成真功能時照這個形狀改寫。"""

from __future__ import annotations

from httpx import AsyncClient

ITEMS = "/api/v1/items"


async def _create(client: AsyncClient, code: str, name: str = "測試項目") -> dict:
    response = await client.post(ITEMS, json={"code": code, "name": name})
    assert response.status_code == 201, response.text
    return response.json()


async def test_沒登入不能看清單(client: AsyncClient):
    assert (await client.get(ITEMS)).status_code == 401


async def test_建立之後查得到(auth_client: AsyncClient):
    created = await _create(auth_client, "A-001")
    response = await auth_client.get(f"{ITEMS}/{created['id']}")
    assert response.status_code == 200
    assert response.json()["code"] == "A-001"


async def test_代號重複回四零九(auth_client: AsyncClient):
    await _create(auth_client, "A-001")
    response = await auth_client.post(ITEMS, json={"code": "A-001", "name": "撞名"})
    assert response.status_code == 409
    assert response.json()["code"] == "CONFLICT"


async def test_清單回統一的分頁格式(auth_client: AsyncClient):
    for index in range(3):
        await _create(auth_client, f"A-{index:03d}")
    body = (await auth_client.get(ITEMS, params={"page": 1, "page_size": 2})).json()
    assert set(body) == {"items", "total", "page", "page_size"}
    assert body["total"] == 3
    assert len(body["items"]) == 2


async def test_關鍵字會同時比對代號與名稱(auth_client: AsyncClient):
    await _create(auth_client, "A-001", "螺絲")
    await _create(auth_client, "B-002", "墊片")
    assert (await auth_client.get(ITEMS, params={"keyword": "螺絲"})).json()["total"] == 1
    assert (await auth_client.get(ITEMS, params={"keyword": "B-0"})).json()["total"] == 1


async def test_排序只認白名單裡的欄位(auth_client: AsyncClient):
    await _create(auth_client, "B-002")
    await _create(auth_client, "A-001")
    listed = (await auth_client.get(ITEMS, params={"sort": "code"})).json()
    codes = [row["code"] for row in listed["items"]]
    assert codes == ["A-001", "B-002"]
    # 亂給欄位不會爆，退回預設排序。
    assert (await auth_client.get(ITEMS, params={"sort": "隨便亂打"})).status_code == 200


async def test_更新只動有給的欄位(auth_client: AsyncClient):
    created = await _create(auth_client, "A-001", "原本的名字")
    response = await auth_client.patch(f"{ITEMS}/{created['id']}", json={"quantity": 7})
    assert response.status_code == 200
    assert response.json()["quantity"] == 7
    assert response.json()["name"] == "原本的名字"


async def test_刪除是軟刪除_清單看不到但資料還在(auth_client: AsyncClient):
    created = await _create(auth_client, "A-001")
    assert (await auth_client.delete(f"{ITEMS}/{created['id']}")).status_code == 204
    assert (await auth_client.get(ITEMS)).json()["total"] == 0
    assert (await auth_client.get(f"{ITEMS}/{created['id']}")).status_code == 404


async def test_找不到的_id_回四零四(auth_client: AsyncClient):
    missing = "00000000-0000-0000-0000-000000000000"
    response = await auth_client.get(f"{ITEMS}/{missing}")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


async def test_回傳的時間戳一定帶時區(auth_client: AsyncClient):
    """少了時區的時間戳對前端是無解的——它不知道該不該換算。"""
    created = await _create(auth_client, "A-001")
    assert created["created_at"].endswith("Z") or "+00:00" in created["created_at"]
