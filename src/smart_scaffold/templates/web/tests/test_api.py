"""HTTP 層：狀態碼、錯誤格式，以及「API 回 JSON、頁面回導向」這個分工。"""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_健康檢查(client: TestClient):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_沒登入開頁面會被導向登入頁(client: TestClient):
    """直接把 401 甩給瀏覽器只會得到一片白，所以頁面要導向。"""
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"] == "/login?next=/"


def test_登入成功會拿到_httponly_的_cookie(client: TestClient, admin):
    response = client.post(
        "/login",
        data={"email": "admin@example.com", "password": "admin1234"},
        follow_redirects=False,
    )
    assert response.status_code == 302
    assert response.headers["location"] == "/"
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "samesite=lax" in cookie.lower()


def test_密碼錯誤留在登入頁而且不說是哪裡錯(client: TestClient, admin):
    response = client.post(
        "/login", data={"email": "admin@example.com", "password": "wrong"}
    )
    assert response.status_code == 401
    assert "帳號或密碼不正確" in response.text


def test_帳號不存在的訊息一模一樣(client: TestClient, admin):
    response = client.post("/login", data={"email": "nobody@example.com", "password": "x"})
    assert "帳號或密碼不正確" in response.text


def test_登入之後開得了首頁(auth_client: TestClient):
    response = auth_client.get("/")
    assert response.status_code == 200
    assert "首頁" in response.text


def test_登出會清掉_cookie(auth_client: TestClient):
    response = auth_client.post("/logout", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"] == "/login"


def test_壞掉的_cookie_當成沒登入(client: TestClient, admin):
    from {{name}}.auth import SESSION_COOKIE

    # cookie 的值只能是 latin-1，這裡不要用中文。
    client.cookies.set(SESSION_COOKIE, "not.a.valid.signature")
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"].startswith("/login")
