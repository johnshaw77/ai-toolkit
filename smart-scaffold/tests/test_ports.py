"""F3 埠號偵測。

重點是**降級**：docker 不在、沒在跑、逾時，都只能少一個來源，不能中斷。
"""

from __future__ import annotations

import socket

import pytest

from smart_scaffold.ports import (
    NoFreePortError,
    docker_published_ports,
    is_port_free,
    suggest_free_port,
)

#: 一個一定不存在的指令，用來模擬「這台機器沒有 docker」。
NO_SUCH_COMMAND = "smart-scaffold-definitely-not-a-real-command"


def test_佔用中的埠會被跳過():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        taken = sock.getsockname()[1]
        assert is_port_free(taken) is False
        assert suggest_free_port(taken, blocked=set()) != taken


def test_從起始埠開始找():
    free = suggest_free_port(49200, blocked=set())
    assert free >= 49200


def test_已知被佔用的埠不會被建議():
    blocked = {49300, 49301}
    assert suggest_free_port(49300, blocked=blocked, is_free=lambda _p: True) == 49302


def test_全部被佔用時回報錯誤而不是無限迴圈():
    with pytest.raises(NoFreePortError) as excinfo:
        suggest_free_port(49400, limit=50, blocked=set(), is_free=lambda _p: False)
    assert excinfo.value.limit == 50
    assert "49400" in str(excinfo.value)


def test_只掃描指定範圍內的埠():
    seen: list[int] = []

    def is_free(port: int) -> bool:
        seen.append(port)
        return False

    with pytest.raises(NoFreePortError):
        suggest_free_port(50000, limit=5, blocked=set(), is_free=is_free)
    assert seen == [50000, 50001, 50002, 50003, 50004]


def test_docker_不存在只是少一個來源():
    assert docker_published_ports(docker_cmd=NO_SUCH_COMMAND) == set()


def test_docker_不存在時整支流程照樣給得出埠():
    port = suggest_free_port(49500, docker_cmd=NO_SUCH_COMMAND)
    assert 49500 <= port < 49550


def test_docker_指令失敗只是少一個來源():
    # `false` 一定回傳非零離開碼，模擬 docker daemon 沒在跑。
    assert docker_published_ports(docker_cmd="false") == set()


def test_docker_逾時只是少一個來源():
    assert docker_published_ports(docker_cmd="sleep", timeout=0.01) == set()


def test_解析得出_docker_發布的埠(monkeypatch):
    import subprocess

    class _Completed:
        returncode = 0
        stdout = "0.0.0.0:8000->8000/tcp, :::8000->8000/tcp\n0.0.0.0:5173->80/tcp\n"
        stderr = ""

    monkeypatch.setattr(subprocess, "run", lambda *a, **k: _Completed())
    assert docker_published_ports() == {8000, 5173}


def test_limit_至少要是一():
    with pytest.raises(ValueError):
        suggest_free_port(8000, limit=0)
