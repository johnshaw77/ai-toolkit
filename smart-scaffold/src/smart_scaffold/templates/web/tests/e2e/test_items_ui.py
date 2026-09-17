"""端對端：真的開一個瀏覽器走完整流程。

**動到畫面就要跑這一組。** 單元測試與 API 測試都綠、畫面卻是壞的——這件事
比想像中常發生（例如靜態檔路徑打錯、JS 語法錯誤），而那些只有瀏覽器看得見。
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

pytestmark = pytest.mark.e2e


@pytest.fixture
def items_page(logged_in: Page, live_server: str) -> Page:
    logged_in.goto(f"{live_server}/items")
    return logged_in


def test_列表顯示種好的資料(items_page: Page):
    expect(items_page.get_by_role("cell", name="A-001")).to_be_visible()
    expect(items_page.get_by_text("共 3 筆")).to_be_visible()


def test_搜尋會縮小結果重置會還原(items_page: Page):
    items_page.get_by_placeholder("搜尋代號或名稱").fill("A-001")
    items_page.get_by_role("button", name="查詢").click()
    expect(items_page.get_by_text("共 1 筆")).to_be_visible()

    items_page.get_by_role("button", name="重置").click()
    expect(items_page.get_by_text("共 3 筆")).to_be_visible()


def test_新增編輯刪除走完一圈(items_page: Page):
    items_page.get_by_role("button", name="新增").click()
    items_page.get_by_placeholder("例如 A-001").fill("E2E-001")
    items_page.get_by_placeholder("請輸入名稱").fill("E2E 建立的項目")
    items_page.get_by_role("button", name="儲存").click()

    expect(items_page.get_by_text("已新增")).to_be_visible()
    row = items_page.get_by_role("row").filter(has_text="E2E-001")
    expect(row).to_be_visible()

    row.get_by_role("button", name="編輯").click()
    items_page.get_by_placeholder("請輸入名稱").fill("E2E 改過的名字")
    items_page.get_by_role("button", name="儲存").click()
    expect(items_page.get_by_text("已更新")).to_be_visible()
    expect(items_page.get_by_role("cell", name="E2E 改過的名字")).to_be_visible()

    items_page.get_by_role("row").filter(has_text="E2E-001").get_by_role(
        "button", name="刪除"
    ).click()
    items_page.get_by_role("button", name="確定").click()
    expect(items_page.get_by_text("已刪除")).to_be_visible()
    expect(items_page.get_by_role("cell", name="E2E-001")).to_have_count(0)


def test_代號重複會顯示後端回的訊息(items_page: Page):
    items_page.get_by_role("button", name="新增").click()
    items_page.get_by_placeholder("例如 A-001").fill("A-001")
    items_page.get_by_placeholder("請輸入名稱").fill("撞名的項目")
    items_page.get_by_role("button", name="儲存").click()

    expect(items_page.get_by_text("代號 A-001 已經有人用了")).to_be_visible()
