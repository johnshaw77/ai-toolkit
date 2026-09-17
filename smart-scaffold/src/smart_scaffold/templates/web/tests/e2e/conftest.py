"""端對端測試的環境。

用 **pytest-playwright**（Python 套件）而不是 Node 版的 playwright——
這個 preset 的前提就是不引入 npm / Node，測試工具也不該破例。

這裡會自己把服務跑起來：獨立的暫存資料庫、獨立的埠，跑完就收掉。
所以 `make e2e` 不需要你先開任何東西。
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from collections.abc import Iterator
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

import pytest
from playwright.sync_api import expect

PROJECT_ROOT = Path(__file__).resolve().parents[2]
STARTUP_TIMEOUT = 40.0

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin1234"


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _wait_until_up(url: str, process: subprocess.Popen[bytes], log: Path) -> None:
    deadline = time.time() + STARTUP_TIMEOUT
    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"服務啟動失敗（離開碼 {process.returncode}）：\n{log.read_text()}")
        try:
            with urlopen(url) as response:  # noqa: S310 - 固定是本機網址
                if response.status == 200:
                    return
        except (URLError, OSError):
            time.sleep(0.2)
    raise RuntimeError(f"服務在 {STARTUP_TIMEOUT:.0f} 秒內沒有起來：{url}\n{log.read_text()}")


@pytest.fixture(scope="session")
def live_server(tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    """跑一份只給 e2e 用的服務，回傳它的網址。"""
    port = _free_port()
    database = tmp_path_factory.mktemp("e2e") / "e2e.db"

    env = {
        **os.environ,
        "DATABASE_PATH": str(database),
        "APP_PORT": str(port),
        "SEED_ADMIN_EMAIL": ADMIN_EMAIL,
        "SEED_ADMIN_PASSWORD": ADMIN_PASSWORD,
    }

    # 先把資料建好，再起服務——順序反過來的話第一個測試會看到空列表。
    subprocess.run(  # noqa: S603
        [sys.executable, "-m", "{{name}}", "seed"],
        cwd=PROJECT_ROOT,
        env=env,
        check=True,
        capture_output=True,
    )

    # 服務的輸出寫到檔案而不是 PIPE：沒有人去讀的 PIPE 會在收尾時留下沒關的
    # 檔案描述子，而且塞滿了還會讓服務卡住。寫成檔案也讓啟動失敗時看得到原因。
    log_path = database.parent / "server.log"
    base_url = f"http://127.0.0.1:{port}"

    with log_path.open("wb") as log_file:
        process = subprocess.Popen(  # noqa: S603
            [sys.executable, "-m", "{{name}}", "serve"],
            cwd=PROJECT_ROOT,
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
        )
        try:
            _wait_until_up(f"{base_url}/api/health", process, log_path)
            yield base_url
        finally:
            process.terminate()
            process.wait(timeout=10)


@pytest.fixture
def logged_in(page, live_server: str):
    """登入之後停在首頁。"""
    page.goto(f"{live_server}/")
    page.get_by_placeholder("admin@example.com").fill(ADMIN_EMAIL)
    page.get_by_placeholder("請輸入密碼").fill(ADMIN_PASSWORD)
    page.get_by_role("button", name="登入").click()
    expect(page.get_by_role("heading", name="首頁")).to_be_visible()
    return page
