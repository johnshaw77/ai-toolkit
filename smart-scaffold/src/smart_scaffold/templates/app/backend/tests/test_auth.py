"""登入、換票、重用偵測。"""

from __future__ import annotations

from httpx import AsyncClient

from app.models.user import User

LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"


async def _login(client: AsyncClient) -> dict:
    credentials = {"email": "admin@example.com", "password": "admin1234"}
    response = await client.post(LOGIN, json=credentials)
    assert response.status_code == 200, response.text
    return response.json()


async def test_登入成功會拿到兩張票(client: AsyncClient, admin: User):
    body = await _login(client)
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["user"]["email"] == "admin@example.com"


async def test_密碼錯誤回四零一而且不說是哪裡錯(client: AsyncClient, admin: User):
    response = await client.post(LOGIN, json={"email": "admin@example.com", "password": "wrong"})
    assert response.status_code == 401
    assert response.json()["message"] == "帳號或密碼不正確"


async def test_帳號不存在的訊息跟密碼錯誤一模一樣(client: AsyncClient, admin: User):
    response = await client.post(LOGIN, json={"email": "nobody@example.com", "password": "x"})
    assert response.status_code == 401
    assert response.json()["message"] == "帳號或密碼不正確"


async def test_缺欄位回四二二並指出是哪個欄位(client: AsyncClient):
    response = await client.post(LOGIN, json={"email": "admin@example.com"})
    assert response.status_code == 422
    assert response.json()["detail"][0]["field"] == "password"


async def test_換票會拿到新的一張(client: AsyncClient, admin: User):
    first = await _login(client)
    response = await client.post(REFRESH, json={"refresh_token": first["refresh_token"]})
    assert response.status_code == 200
    assert response.json()["refresh_token"] != first["refresh_token"]


async def test_舊票被重用時整條鏈一起作廢(client: AsyncClient, admin: User):
    first = await _login(client)
    second = (
        await client.post(REFRESH, json={"refresh_token": first["refresh_token"]})
    ).json()

    # 拿已經換掉的舊票再換一次——這代表票外流了。
    reused = await client.post(REFRESH, json={"refresh_token": first["refresh_token"]})
    assert reused.status_code == 401

    # 新票也要跟著失效，逼使用者重新登入。
    after = await client.post(REFRESH, json={"refresh_token": second["refresh_token"]})
    assert after.status_code == 401


async def test_登出之後那張票就不能用了(client: AsyncClient, admin: User):
    body = await _login(client)
    assert (
        await client.post("/api/v1/auth/logout", json={"refresh_token": body["refresh_token"]})
    ).status_code == 204
    response = await client.post(REFRESH, json={"refresh_token": body["refresh_token"]})
    assert response.status_code == 401


async def test_沒帶憑證就拿不到自己的資料(client: AsyncClient):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"
