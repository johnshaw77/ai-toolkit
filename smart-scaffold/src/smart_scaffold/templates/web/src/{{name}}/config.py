"""設定載入。

分兩層：``config/settings.yaml`` 放不含秘密的設定（進版控），``.env`` 放秘密
（不進版控）。同名的話 ``.env`` 贏——本機要蓋掉什麼就改 ``.env``。

新增設定項目時，``config/settings.yaml``、``.env.example``、這個檔案
**三個地方要一起改**，不要只改一處。
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
DEFAULT_DATABASE_PATH = "data/{{name}}.db"
DEFAULT_SESSION_MAX_AGE = 604_800  # 7 天

#: 開發用的預設金鑰。上線前一定要換掉——換掉之後所有人會被登出。
DEV_SECRET_KEY = "dev-only-change-me-before-deploying-anywhere-0123456789"


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


def _section(settings: dict[str, Any] | None, name: str) -> dict[str, Any]:
    settings = settings if settings is not None else load_settings()
    value = settings.get(name)
    return value if isinstance(value, dict) else {}


def resolve_port(settings: dict[str, Any] | None = None) -> int:
    """決定服務埠：``.env`` 的 ``APP_PORT`` > settings.yaml > 內建預設。

    **這是服務埠的唯一來源**，不要在別的地方寫死。
    """
    raw = os.environ.get("APP_PORT")
    if raw:
        try:
            return int(raw)
        except ValueError:
            pass
    try:
        return int(_section(settings, "service").get("port", DEFAULT_PORT))
    except (TypeError, ValueError):
        return DEFAULT_PORT


def resolve_host(settings: dict[str, Any] | None = None) -> str:
    return str(_section(settings, "service").get("host", DEFAULT_HOST))


def resolve_database_path(settings: dict[str, Any] | None = None) -> Path:
    """sqlite 檔案的絕對路徑。相對路徑一律以專案根目錄為基準。"""
    raw = os.environ.get("DATABASE_PATH") or _section(settings, "database").get(
        "path", DEFAULT_DATABASE_PATH
    )
    path = Path(str(raw)).expanduser()
    return path if path.is_absolute() else PROJECT_ROOT / path


def resolve_secret_key() -> str:
    return os.environ.get("SECRET_KEY") or DEV_SECRET_KEY


def resolve_session_max_age() -> int:
    raw = os.environ.get("SESSION_MAX_AGE")
    if raw:
        try:
            return int(raw)
        except ValueError:
            pass
    return DEFAULT_SESSION_MAX_AGE


def resolve_log_level(settings: dict[str, Any] | None = None) -> str:
    raw = os.environ.get("LOG_LEVEL")
    if raw:
        return raw.upper()
    return str(_section(settings, "logging").get("level", DEFAULT_LOG_LEVEL)).upper()


def app_title(settings: dict[str, Any] | None = None) -> str:
    """介面上顯示的名稱。"""
    return str(_section(settings, "app").get("title", "{{title}}"))
