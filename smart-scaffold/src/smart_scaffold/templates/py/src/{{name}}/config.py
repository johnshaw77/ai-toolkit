"""設定載入。

分兩層：``config/settings.yaml`` 放不含秘密的設定（進版控），``.env`` 放秘密
（不進版控）。同名的話 ``.env`` 贏——本機要蓋掉什麼就改 ``.env``。
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

#: 專案根目錄（``src/{{name}}/config.py`` 往上三層）。
PROJECT_ROOT = Path(__file__).resolve().parents[2]
SETTINGS_PATH = PROJECT_ROOT / "config" / "settings.yaml"
ENV_PATH = PROJECT_ROOT / ".env"

DEFAULT_PORT = {{port}}
DEFAULT_HOST = "127.0.0.1"
DEFAULT_LOG_LEVEL = "INFO"


def load_settings(path: Path | None = None) -> dict[str, Any]:
    """讀 ``config/settings.yaml``；檔案不在就回傳空字典，不炸掉。"""
    target = Path(path) if path is not None else SETTINGS_PATH
    if not target.is_file():
        return {}
    with target.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    return data if isinstance(data, dict) else {}


def load_env(path: Path | None = None) -> None:
    """把 ``.env`` 讀進環境變數；沒有這個檔案就算了。"""
    target = Path(path) if path is not None else ENV_PATH
    if target.is_file():
        load_dotenv(target, override=False)


def resolve_port(settings: dict[str, Any] | None = None) -> int:
    """決定服務埠：``.env`` 的 ``APP_PORT`` > settings.yaml > 內建預設。"""
    raw = os.environ.get("APP_PORT")
    if raw:
        try:
            return int(raw)
        except ValueError:
            pass
    settings = settings if settings is not None else load_settings()
    service = settings.get("service") or {}
    value = service.get("port", DEFAULT_PORT)
    try:
        return int(value)
    except (TypeError, ValueError):
        return DEFAULT_PORT


def resolve_log_level(settings: dict[str, Any] | None = None) -> str:
    """決定 log 等級：``.env`` 的 ``LOG_LEVEL`` > settings.yaml > 內建預設。"""
    raw = os.environ.get("LOG_LEVEL")
    if raw:
        return raw.upper()
    settings = settings if settings is not None else load_settings()
    logging_section = settings.get("logging") or {}
    return str(logging_section.get("level", DEFAULT_LOG_LEVEL)).upper()
