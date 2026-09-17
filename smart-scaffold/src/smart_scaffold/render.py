"""模板渲染器：把 ``templates/<preset>/`` 整棵複製到目標路徑，過程中替換變數。

佔位符是 ``{{var}}``，**大括號裡不能有空白**。

刻意不用 ``string.Template`` 的 ``$var``——模板裡有 Makefile 與 shell，
`$(MAKE)` 和 `$$` 會被咬掉。

「不能有空白」這條是為了跟 Vue 共存：Vue 的插值長得一模一樣（``{{ user.name }}``），
而 prettier 會把它排版成前後帶空白的樣子。所以規則是——

* ``{{var}}``（沒空白）＝ 腳手架的佔位符，會被替換，不認得的變數直接中止。
* ``{{ expr }}``（有空白）＝ 原樣留著，交給 Vue 自己處理。
"""

from __future__ import annotations

import os
import re
import shutil
import tomllib
from collections.abc import Iterable
from pathlib import Path
from typing import Any

PLACEHOLDER = re.compile(r"\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}")

#: 模板自己的設定檔，描述「哪些檔案是有條件的」。不會被複製到生成的專案裡。
MANIFEST_NAME = ".scaffold.toml"

#: 共用檔案裡的條件區段標記。刻意只認這串字，前後是什麼註解符號都行——
#: Python 的 ``#``、JS 的 ``//``、Jinja 的 ``{#  #}`` 都能用同一套。
#:
#: 條件成立時只拿掉標記那兩行（生出來的專案看不到標記）；
#: 不成立時連同中間的內容整段拿掉。
CONDITION = re.compile(r"scaffold:(ifnot|if|endif)(?:\s+([A-Za-z_][A-Za-z0-9_]*))?")


class RenderError(Exception):
    """渲染過程出錯。"""


class MissingVariableError(RenderError):
    """模板用到了定義裡沒有的變數。"""

    def __init__(self, variable: str, source: str) -> None:
        self.variable = variable
        self.source = source
        super().__init__(f"模板 {source} 用到未定義的變數 {{{{{variable}}}}}")


class UnbalancedConditionError(RenderError):
    """條件區段的標記沒有配對。"""

    def __init__(self, source: str, detail: str) -> None:
        super().__init__(f"模板 {source} 的條件區段標記不成對：{detail}")


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


def load_manifest(template_dir: Path) -> dict[str, Any]:
    """讀模板自己的 ``.scaffold.toml``；沒有就回傳空的設定。"""
    path = Path(template_dir) / MANIFEST_NAME
    if not path.is_file():
        return {}
    with path.open("rb") as handle:
        return tomllib.load(handle)


def optional_paths(manifest: dict[str, Any], flags: dict[str, bool]) -> set[str]:
    """算出這次**不要**複製的檔案（相對路徑，POSIX 形式）。

    manifest 長這樣::

        [optional]
        demo = ["src/{{name}}/items.py", "tests/test_items.py"]

    旗標為假時，清單裡的檔案與資料夾整個略過。
    """
    skip: set[str] = set()
    optional = manifest.get("optional")
    if not isinstance(optional, dict):
        return skip
    for flag, paths in optional.items():
        if flags.get(flag):
            continue
        for entry in paths or ():
            skip.add(str(entry).strip("/"))
    return skip


def apply_conditions(text: str, flags: dict[str, bool], *, source: str) -> str:
    """處理 ``scaffold:if`` / ``scaffold:endif`` 區段。

    條件成立：只拿掉標記那幾行。條件不成立：整段拿掉。
    ``scaffold:ifnot`` 是反過來的，用在「沒有這個東西時才要的內容」。
    標記不成對時中止並指出是哪個檔案——靜靜產出半個檔案比報錯難查得多。
    """
    # 注意判斷的是 "scaffold:"，不是 "scaffold:if"——後者不會命中孤零零的
    # endif（"scaffold:endif" 裡並沒有 "scaffold:if" 這個子字串）。
    if "scaffold:" not in text:
        return text

    lines = text.splitlines(keepends=True)
    kept: list[str] = []
    stack: list[bool] = []

    for number, line in enumerate(lines, start=1):
        match = CONDITION.search(line)
        if match is None:
            if all(stack):
                kept.append(line)
            continue

        keyword, name = match.group(1), match.group(2)
        if keyword in ("if", "ifnot"):
            if name is None:
                raise UnbalancedConditionError(
                    source, f"第 {number} 行的 {keyword} 沒有指定旗標"
                )
            active = bool(flags.get(name))
            stack.append(not active if keyword == "ifnot" else active)
        else:
            if not stack:
                raise UnbalancedConditionError(source, f"第 {number} 行多了一個 endif")
            stack.pop()

    if stack:
        raise UnbalancedConditionError(source, "有 if 沒有對應的 endif")
    return "".join(kept)


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
    flags: dict[str, bool] | None = None,
) -> list[Path]:
    """把整棵模板渲染到 ``dest``，回傳寫出來的檔案清單（已排序）。

    ``flags`` 控制有條件的內容：模板的 ``.scaffold.toml`` 列出整個檔案要不要產生，
    檔案內的 ``scaffold:if`` 區段則控制共用檔案裡的片段。
    """
    source = Path(source)
    dest = Path(dest)
    flags = flags or {}
    skip = optional_paths(load_manifest(source), flags)
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
        if label == MANIFEST_NAME:
            continue  # 模板自己的設定檔不進生成的專案
        if any(label == entry or label.startswith(f"{entry}/") for entry in skip):
            continue
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
            rendered = apply_conditions(data.decode("utf-8"), flags, source=label)
            rendered = render_text(rendered, variables, source=label)
            target.write_text(rendered, encoding="utf-8", newline="\n")
        shutil.copymode(item, target)
        written.append(target)

    return sorted(written)


def _walk(root: Path) -> Iterable[Path]:
    """依序走訪模板底下所有項目，順序固定（測試才好比對）。"""
    return sorted(root.rglob("*"), key=lambda p: p.as_posix())
