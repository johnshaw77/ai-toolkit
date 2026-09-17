"""埠號偵測：開新專案時直接給一個沒被佔用的預設埠。

佔用判定有兩個來源：實際 bind 測試，以及 ``docker ps`` 列出的已發布埠。
**任何一個來源壞掉都只是少一個來源**——Windows 上可能根本沒有 docker，
這種時候不得讓整支工具中斷。
"""

from __future__ import annotations

import re
import socket
import subprocess
from collections.abc import Callable

#: 一次最多往後找幾個埠。
DEFAULT_LIMIT = 50

#: ``docker ps`` 的埠欄位長這樣：``0.0.0.0:8000->8000/tcp, :::8000->8000/tcp``。
_PUBLISHED_PORT = re.compile(r":(\d{1,5})->")

_BIND_HOSTS = ("127.0.0.1", "0.0.0.0")


class NoFreePortError(RuntimeError):
    """從起始埠往後找了一整段都被佔用。"""

    def __init__(self, start: int, limit: int) -> None:
        self.start = start
        self.limit = limit
        super().__init__(f"從 {start} 起連續 {limit} 個埠都被佔用了，請自己指定一個")


def is_port_free(port: int, *, hosts: tuple[str, ...] = _BIND_HOSTS) -> bool:
    """實際 bind 一次看看這個埠能不能用。"""
    for host in hosts:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((host, port))
            except OSError:
                return False
    return True


def docker_published_ports(*, docker_cmd: str = "docker", timeout: float = 3.0) -> set[int]:
    """問 docker 有哪些埠已經發布出來；問不到就回傳空集合。

    docker 不存在、沒在跑、指令逾時、輸出看不懂——一律當作「這個來源沒資料」，
    不拋例外。
    """
    try:
        completed = subprocess.run(  # noqa: S603
            [docker_cmd, "ps", "--format", "{{.Ports}}"],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return set()
    if completed.returncode != 0:
        return set()
    ports: set[int] = set()
    for match in _PUBLISHED_PORT.finditer(completed.stdout or ""):
        value = int(match.group(1))
        if 0 < value < 65536:
            ports.add(value)
    return ports


def used_ports(*, docker_cmd: str = "docker", timeout: float = 3.0) -> set[int]:
    """目前已知被佔用的埠（只含查得到的來源）。"""
    return docker_published_ports(docker_cmd=docker_cmd, timeout=timeout)


def suggest_free_port(
    start: int,
    *,
    limit: int = DEFAULT_LIMIT,
    docker_cmd: str = "docker",
    is_free: Callable[[int], bool] | None = None,
    blocked: set[int] | None = None,
) -> int:
    """從 ``start`` 起回傳第一個沒被佔用的埠。

    連續 ``limit`` 個都被佔用時丟 :class:`NoFreePortError`，不會無限迴圈。
    """
    if limit < 1:
        raise ValueError("limit 至少要是 1")
    check = is_free if is_free is not None else is_port_free
    taken = blocked if blocked is not None else used_ports(docker_cmd=docker_cmd)

    for port in range(start, start + limit):
        if port > 65535:
            break
        if port in taken:
            continue
        if check(port):
            return port
    raise NoFreePortError(start, limit)
