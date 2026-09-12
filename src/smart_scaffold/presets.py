"""每個 preset 要問哪些題。

**新增一題只改這個檔案。** CLI 旗標、``--help``、互動問答都是從這裡長出來的，
在別的地方再寫一份清單就是 bug。
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .ports import NoFreePortError, suggest_free_port
from .postactions import (
    DEFAULT_INSTALL_STEPS,
    DEFAULT_VERIFY_COMMANDS,
    InstallStep,
)
from .questions import Question

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"

#: 專案名同時是 Python 套件名，所以限制得比資料夾名嚴格。
_NAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")

#: 名稱與描述都會被寫進模板的程式碼裡，太長會撞到 ruff 的 line-length 100。
#: 描述用**顯示寬度**算——中日韓文字一個佔兩格，ruff 也是這樣量的。
MAX_NAME_LENGTH = 40
MAX_DESCRIPTION_WIDTH = 60

#: 找不到空閒埠時退回這個，讓工具還是生得出專案。
FALLBACK_PORT = 8000
PORT_SEARCH_START = 8000

#: 前端 dev server 從這裡往後找（Vite 的慣例埠）。
FRONTEND_PORT_SEARCH_START = 5173
FALLBACK_FRONTEND_PORT = 5173


def display_width(text: str) -> int:
    """字串在終端機（與 ruff 眼裡）的寬度：全形字算兩格。"""
    return sum(2 if unicodedata.east_asian_width(ch) in "WF" else 1 for ch in text)


def _check_name(value: Any, _answers: dict[str, Any]) -> str | None:
    text = str(value)
    if not _NAME_RE.match(text):
        return "只能用小寫英文、數字、底線，而且要以英文字母開頭（例：demo_tool）"
    if len(text) > MAX_NAME_LENGTH:
        return f"太長了，最多 {MAX_NAME_LENGTH} 個字（名稱會被寫進生成出來的程式碼裡）"
    return None


def _check_description(value: Any, _answers: dict[str, Any]) -> str | None:
    text = str(value).strip()
    if not text:
        return "描述不能空白"
    width = display_width(text)
    if width > MAX_DESCRIPTION_WIDTH:
        return (
            f"太長了（中文字算兩格，目前 {width} 格，上限 {MAX_DESCRIPTION_WIDTH}）"
            "——描述會被原樣寫進生成專案的程式碼裡"
        )
    if "\n" in text:
        return "描述只能寫一行"
    return None


def _check_path(value: Any, _answers: dict[str, Any]) -> str | None:
    text = str(value).strip()
    if not text:
        return "路徑不能空白"
    target = Path(text).expanduser()
    if target.is_file():
        return f"{target} 是一個檔案，不能當專案資料夾"
    if target.is_dir() and any(target.iterdir()):
        return f"{target} 已經存在而且不是空的，換一個路徑"
    return None


def _check_title(value: Any, _answers: dict[str, Any]) -> str | None:
    text = str(value).strip()
    if not text:
        return "顯示名稱不能空白"
    width = display_width(text)
    if width > MAX_DESCRIPTION_WIDTH:
        return f"太長了（中文字算兩格，目前 {width} 格，上限 {MAX_DESCRIPTION_WIDTH}）"
    return None


def _check_port(value: Any, _answers: dict[str, Any]) -> str | None:
    port = int(value)
    if not 1 <= port <= 65535:
        return "埠號要在 1 到 65535 之間"
    return None


def _free_port(start: int, fallback: int) -> int:
    """找一個沒被佔用的埠；真的找不到就退回固定值，不讓工具中斷。"""
    try:
        return suggest_free_port(start)
    except (NoFreePortError, OSError):
        return fallback


def default_port(_answers: dict[str, Any]) -> int:
    """後端／單一服務的預設埠。"""
    return _free_port(PORT_SEARCH_START, FALLBACK_PORT)


def default_frontend_port(answers: dict[str, Any]) -> int:
    """前端 dev server 的預設埠，不能跟後端撞在一起。"""
    port = _free_port(FRONTEND_PORT_SEARCH_START, FALLBACK_FRONTEND_PORT)
    backend = answers.get("backend_port")
    if backend is not None and int(backend) == port:
        port = _free_port(port + 1, FALLBACK_FRONTEND_PORT + 1)
    return port


#: 每個 preset 都要問的身分題，排在最前面。
IDENTITY_QUESTIONS: tuple[Question, ...] = (
    Question(
        key="name",
        prompt="專案名稱（同時是 Python 套件名）",
        type="str",
        validate=_check_name,
    ),
    Question(
        key="description",
        prompt="一句話描述這個專案",
        type="str",
        default="{name} 專案",
        validate=_check_description,
    ),
    Question(
        key="path",
        prompt="要建在哪裡",
        type="str",
        default="~/Desktop/@SideProjects/{name}",
        validate=_check_path,
    ),
)

#: Python 版本，凡是有 Python 的 preset 都要問。
PYTHON_QUESTION = Question(
    key="python_version",
    prompt="Python 版本",
    type="choice",
    choices=("3.12", "3.13"),
    default="3.12",
)

#: 後置動作也是問題，這樣「新增一題只改一處」才沒有例外。
POST_ACTION_QUESTIONS: tuple[Question, ...] = (
    Question(
        key="install",
        prompt="生完之後要幫你裝依賴嗎",
        type="bool",
        default=True,
    ),
    Question(
        key="git",
        prompt="要 git init 並產生第一顆 commit 嗎",
        type="bool",
        default=True,
    ),
)

#: py preset：一個服務埠就夠了，而且可以不要。
PY_QUESTIONS: tuple[Question, ...] = (
    *IDENTITY_QUESTIONS,
    PYTHON_QUESTION,
    Question(
        key="service",
        prompt="要在 config/settings.yaml 裡保留服務埠設定嗎",
        type="bool",
        default=True,
    ),
    Question(
        key="port",
        prompt="服務埠",
        type="int",
        default=default_port,
        validate=_check_port,
        when=lambda answers: bool(answers.get("service")),
    ),
    *POST_ACTION_QUESTIONS,
)


@dataclass(frozen=True)
class Preset:
    """一個可以生成的專案形態。"""

    key: str
    summary: str
    questions: tuple[Question, ...]
    #: 生成完要跑哪幾包依賴安裝；全端專案前後端各一包。
    install_steps: tuple[InstallStep, ...] = DEFAULT_INSTALL_STEPS
    #: 最後印出來的驗證指令。
    verify_commands: tuple[str, ...] = DEFAULT_VERIFY_COMMANDS
    ready: bool = True

    @property
    def template_dir(self) -> Path:
        return TEMPLATES_DIR / self.key


#: app preset：前後端各一個埠，另外要問資料庫與顯示用的中文名稱。
APP_QUESTIONS: tuple[Question, ...] = (
    *IDENTITY_QUESTIONS,
    Question(
        key="title",
        prompt="介面上顯示的名稱（會出現在瀏覽器標題與側邊欄）",
        type="str",
        default="{description}",
        validate=_check_title,
    ),
    PYTHON_QUESTION,
    Question(
        key="backend_port",
        prompt="後端 API 的埠",
        type="int",
        default=default_port,
        validate=_check_port,
    ),
    Question(
        key="frontend_port",
        prompt="前端 dev server 的埠",
        type="int",
        default=default_frontend_port,
        validate=_check_port,
    ),
    Question(
        key="database",
        prompt="資料庫",
        type="choice",
        choices=("sqlite", "postgres"),
        default="sqlite",
    ),
    *POST_ACTION_QUESTIONS,
)

#: app preset 有兩包依賴要裝。
APP_INSTALL_STEPS: tuple[InstallStep, ...] = (
    InstallStep("後端依賴", ("uv", "sync", "--extra", "dev"), "backend"),
    InstallStep("前端依賴", ("npm", "install"), "frontend"),
)

APP_VERIFY_COMMANDS: tuple[str, ...] = (
    "cd backend && uv run pytest",
    "cd backend && uv run ruff check .",
    "cd frontend && npm run build",
)


PRESETS: dict[str, Preset] = {
    "py": Preset(
        key="py",
        summary="Python 專案：uv + src/ 套件分層 + scripts/ + config/",
        questions=PY_QUESTIONS,
    ),
    "app": Preset(
        key="app",
        summary="全端專案：FastAPI + SQLAlchemy 2.0 + Vue3 + Ant Design Vue",
        questions=APP_QUESTIONS,
        install_steps=APP_INSTALL_STEPS,
        verify_commands=APP_VERIFY_COMMANDS,
    ),
}


def get_preset(key: str) -> Preset:
    try:
        return PRESETS[key]
    except KeyError:
        known = "、".join(sorted(PRESETS))
        raise KeyError(f"沒有這個 preset：{key}（可用：{known}）") from None


def database_url_for(database: str, name: str) -> str:
    """把資料庫選擇翻成連線字串。

    sqlite 是預設，因為新專案開箱就要能跑，不該先逼人裝 PostgreSQL。
    """
    if database == "postgres":
        return f"postgresql+asyncpg://{name}:{name}_dev_pw@127.0.0.1:5432/{name}"
    return f"sqlite+aiosqlite:///./{name}.db"


def build_variables(answers: dict[str, Any]) -> dict[str, Any]:
    """把答案轉成模板變數。

    答案字典跟模板變數**不是同一件事**：``when`` 為假的題目不會出現在答案裡，
    但模板還是需要一個值，缺的在這裡補。
    """
    name = str(answers["name"])
    description = str(answers.get("description") or f"{name} 專案")
    database = str(answers.get("database") or "sqlite")
    return {
        "name": name,
        "description": description,
        "title": str(answers.get("title") or description),
        "python_version": str(answers.get("python_version") or "3.12"),
        "port": int(answers.get("port") or FALLBACK_PORT),
        "backend_port": int(answers.get("backend_port") or FALLBACK_PORT),
        "frontend_port": int(answers.get("frontend_port") or FALLBACK_FRONTEND_PORT),
        "database": database,
        "database_url": database_url_for(database, name),
    }
