"""模板渲染器：把 ``templates/<preset>/`` 整棵複製到目標路徑，過程中替換變數。

佔位符是 ``{{var}}``。**刻意不用 ``string.Template`` 的 ``$var``**——模板裡有
Makefile 與 shell，`$(MAKE)` 和 `$$` 會被咬掉。
"""

from __future__ import annotations

import os
import re
import shutil
from collections.abc import Iterable
from pathlib import Path
from typing import Any

PLACEHOLDER = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")


class RenderError(Exception):
    """渲染過程出錯。"""


class MissingVariableError(RenderError):
    """模板用到了定義裡沒有的變數。"""

    def __init__(self, variable: str, source: str) -> None:
        self.variable = variable
        self.source = source
        super().__init__(f"模板 {source} 用到未定義的變數 {{{{{variable}}}}}")


class TargetExistsError(RenderError):
    """目標路徑已存在而且不是空的。"""

    def __init__(self, path: Path) -> None:
        self.path = path
        super().__init__(f"目標路徑已存在且非空，為了安全不覆蓋：{path}")


def render_text(text: str, variables: dict[str, Any], *, source: str = "<string>") -> str:
    """替換 ``{{var}}``；用到未定義的變數就中止並指出是哪個檔案的哪個變數。"""

    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in variables:
            raise MissingVariableError(name, source)
        return str(variables[name])

    return PLACEHOLDER.sub(replace, text)


def render_path_name(name: str, variables: dict[str, Any], *, source: str) -> str:
    """檔名與資料夾名也要替換（例：``{{name}}.code-workspace``）。"""
    rendered = render_text(name, variables, source=source)
    if not rendered or rendered in (".", ".."):
        raise RenderError(f"模板 {source} 的名稱替換後不是合法檔名：{rendered!r}")
    if os.sep in rendered or (os.altsep and os.altsep in rendered):
        raise RenderError(f"模板 {source} 的名稱替換後含有路徑分隔符：{rendered!r}")
    return rendered


def is_binary(data: bytes) -> bool:
    """二進位檔（圖片等）原樣複製，不做文字替換。"""
    if b"\x00" in data:
        return True
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        return True
    return False


def _ensure_target_ok(dest: Path) -> None:
    if dest.exists() and any(dest.iterdir()):
        raise TargetExistsError(dest)


def render_tree(
    source: Path | str,
    dest: Path | str,
    variables: dict[str, Any],
) -> list[Path]:
    """把整棵模板渲染到 ``dest``，回傳寫出來的檔案清單（已排序）。"""
    source = Path(source)
    dest = Path(dest)
    if not source.is_dir():
        raise RenderError(f"找不到模板資料夾：{source}")
    if dest.exists() and dest.is_file():
        raise TargetExistsError(dest)
    if dest.is_dir():
        _ensure_target_ok(dest)

    dest.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    for item in _walk(source):
        relative = item.relative_to(source)
        label = relative.as_posix()
        parts = [render_path_name(part, variables, source=label) for part in relative.parts]
        target = dest.joinpath(*parts)

        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue

        target.parent.mkdir(parents=True, exist_ok=True)
        data = item.read_bytes()
        if is_binary(data):
            target.write_bytes(data)
        else:
            rendered = render_text(data.decode("utf-8"), variables, source=label)
            target.write_text(rendered, encoding="utf-8", newline="\n")
        shutil.copymode(item, target)
        written.append(target)

    return sorted(written)


def _walk(root: Path) -> Iterable[Path]:
    """依序走訪模板底下所有項目，順序固定（測試才好比對）。"""
    return sorted(root.rglob("*"), key=lambda p: p.as_posix())
