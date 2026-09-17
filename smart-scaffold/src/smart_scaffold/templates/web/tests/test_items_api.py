"""範例領域的 HTTP 層。跟著範例領域一起被 --demo 決定要不要產生。"""

from __future__ import annotations

from fastapi.testclient import TestClient

ITEMS = "/api/items"


def test_沒登入打_api_回四零一的_json(client: TestClient):
    response = client.get(ITEMS)
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


def test_建立與清單(auth_client: TestClient):
    created = auth_client.post(ITEMS, json={"code": "A-001", "name": "測試"})
    assert created.status_code == 201
    assert auth_client.get(ITEMS).json()["total"] == 1


def test_代號重複回四零九(auth_client: TestClient):
    auth_client.post(ITEMS, json={"code": "A-001", "name": "測試"})
    response = auth_client.post(ITEMS, json={"code": "A-001", "name": "撞名"})
    assert response.status_code == 409
    assert response.json()["code"] == "CONFLICT"


def test_驗證失敗回四百並指出欄位(auth_client: TestClient):
    response = auth_client.post(ITEMS, json={"code": "", "name": "x"})
    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_ERROR"
    assert "code" in response.json()["message"]


def test_找不到的_id_回四零四(auth_client: TestClient):
    response = auth_client.get(f"{ITEMS}/9999")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


def test_刪除回二零四(auth_client: TestClient):
    created = auth_client.post(ITEMS, json={"code": "A-001", "name": "測試"}).json()
    assert auth_client.delete(f"{ITEMS}/{created['id']}").status_code == 204
    assert auth_client.get(ITEMS).json()["total"] == 0


def test_列表頁開得起來(auth_client: TestClient):
    response = auth_client.get("/items")
    assert response.status_code == 200
    assert "資料列表" in response.text
