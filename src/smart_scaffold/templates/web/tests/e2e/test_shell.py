"""端對端：真的開一個瀏覽器走完整流程。

**動到畫面就要跑這一組。** 單元測試與 API 測試都綠、畫面卻是壞的——這件事
比想像中常發生（例如靜態檔路徑打錯、JS 語法錯誤），而那些只有瀏覽器看得見。
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

pytestmark = pytest.mark.e2e


def test_未登入會被導向登入頁並記住原本要去的地方(page: Page, live_server: str):
    page.goto(f"{live_server}/")
    expect(page).to_have_url(f"{live_server}/login?next=/")
    expect(page.get_by_role("button", name="登入")).to_be_visible()


def test_密碼錯誤會顯示訊息而且留在登入頁(page: Page, live_server: str):
    page.goto(f"{live_server}/login")
    page.get_by_placeholder("admin@example.com").fill("admin@example.com")
    page.get_by_placeholder("請輸入密碼").fill("這不是密碼")
    page.get_by_role("button", name="登入").click()

    expect(page.get_by_text("帳號或密碼不正確")).to_be_visible()
    expect(page).to_have_url(f"{live_server}/login")


def test_登入之後看得到首頁(logged_in: Page):
    expect(logged_in.get_by_role("heading", name="首頁")).to_be_visible()


def test_深色模式切換之後會記住(logged_in: Page):
    before = logged_in.evaluate("document.documentElement.dataset.theme")
    logged_in.get_by_role("button", name="切換深色模式").click()
    after = logged_in.evaluate("document.documentElement.dataset.theme")
    assert after != before

    logged_in.reload()
    assert logged_in.evaluate("document.documentElement.dataset.theme") == after


def test_登出之後不能再直接進去(logged_in: Page, live_server: str):
    logged_in.get_by_role("button", name="登出").click()
    expect(logged_in).to_have_url(f"{live_server}/login")

    logged_in.goto(f"{live_server}/")
    expect(logged_in).to_have_url(f"{live_server}/login?next=/")


def test_走過每一頁_console_不可以有_error_或_warning(page: Page, live_server: str):
    """這條擋的是一整類問題：檢查全過，但畫面其實是壞的。"""
    noise: list[str] = []
    page.on(
        "console",
        lambda message: noise.append(f"[{message.type}] {message.text}")
        if message.type in {"error", "warning"}
        else None,
    )
    page.on("pageerror", lambda error: noise.append(f"[pageerror] {error}"))

    page.goto(f"{live_server}/login")
    page.get_by_placeholder("admin@example.com").fill("admin@example.com")
    page.get_by_placeholder("請輸入密碼").fill("admin1234")
    page.get_by_role("button", name="登入").click()
    expect(page.get_by_role("heading", name="首頁")).to_be_visible()

    assert noise == []
