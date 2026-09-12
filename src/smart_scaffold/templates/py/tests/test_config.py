"""設定載入的樣板測試。照著這個形狀往下加就好。"""

from __future__ import annotations

import textwrap

from {{name}}.config import (
    DEFAULT_PORT,
    load_settings,
    resolve_log_level,
    resolve_port,
)


def test_專案設定檔讀得到而且名字是對的():
    settings = load_settings()
    assert settings["app"]["name"] == "{{name}}"


def test_設定檔不存在時回傳空字典(tmp_path):
    assert load_settings(tmp_path / "沒有這個檔.yaml") == {}


def test_環境變數蓋過設定檔的埠(monkeypatch):
    monkeypatch.setenv("APP_PORT", "54321")
    assert resolve_port({"service": {"port": 9999}}) == 54321


def test_埠號壞掉時退回預設值(monkeypatch):
    monkeypatch.setenv("APP_PORT", "不是數字")
    assert resolve_port({"service": {}}) == DEFAULT_PORT


def test_log_等級一律轉大寫(monkeypatch):
    monkeypatch.delenv("LOG_LEVEL", raising=False)
    assert resolve_log_level({"logging": {"level": "debug"}}) == "DEBUG"


def test_yaml_解析沒有被佔位符污染(tmp_path, monkeypatch):
    monkeypatch.delenv("APP_PORT", raising=False)
    path = tmp_path / "settings.yaml"
    path.write_text(
        textwrap.dedent(
            """
            service:
              port: 12345
            """
        ),
        encoding="utf-8",
    )
    assert resolve_port(load_settings(path)) == 12345
