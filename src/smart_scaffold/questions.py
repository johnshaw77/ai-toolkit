"""問題定義引擎。

把「要問哪些問題」寫成資料，跟「怎麼顯示」分開：之後要換成 TUI 或 GUI 時，
只換 renderer（也就是 ``ask_all`` 的 ``reader`` / ``writer``），不動問題定義。
"""

from __future__ import annotations

import sys
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any

#: 同一題連續失敗幾次就放棄。
MAX_ATTEMPTS = 3

_TRUE_WORDS = {"y", "yes", "true", "1", "on", "是", "好"}
_FALSE_WORDS = {"n", "no", "false", "0", "off", "否", "不"}


class AskError(Exception):
    """問答流程無法完成。CLI 收到之後印訊息並回傳非零離開碼。"""


class AskAborted(AskError):
    """同一題連續失敗達 :data:`MAX_ATTEMPTS` 次。"""

    def __init__(self, key: str, reason: str = "") -> None:
        self.key = key
        self.reason = reason
        detail = f"：{reason}" if reason else ""
        super().__init__(f"「{key}」連續 {MAX_ATTEMPTS} 次沒有得到有效的答案{detail}")


class MissingAnswers(AskError):
    """非互動模式下有必填項沒給。"""

    def __init__(self, keys: Sequence[str]) -> None:
        self.keys = list(keys)
        joined = "、".join(f"--{k.replace('_', '-')}" for k in self.keys)
        super().__init__(f"非互動模式下缺少必填項：{joined}")


class _SafeFormatDict(dict):
    """`{name}` 找不到對應答案時原樣留著，而不是炸出 KeyError。"""

    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def interpolate(text: str, answers: dict[str, Any]) -> str:
    """把 ``{key}`` 換成先前的答案；找不到的 key 原樣保留。"""
    try:
        return text.format_map(_SafeFormatDict(answers))
    except (ValueError, IndexError):
        # 字串裡有不成對的大括號之類——照原樣用，別讓預設值害整支工具掛掉。
        return text


@dataclass(frozen=True)
class Question:
    """一題。

    :param key: 答案字典的鍵，同時決定 CLI 旗標名（``name`` → ``--name``）。
    :param prompt: 給人看的提示文字。
    :param type: ``"str"`` / ``"bool"`` / ``"choice"`` / ``"int"``。
    :param default: 值，或 ``callable(answers)``；字串型別支援 ``{key}`` 插值。
    :param choices: ``type="choice"`` 時的選項。
    :param validate: ``callable(value, answers)``，回傳錯誤訊息字串代表不通過。
    :param when: ``callable(answers)``，回傳假代表這題不問、也不套用預設值。
    """

    key: str
    prompt: str
    type: str = "str"
    default: Any | Callable[[dict[str, Any]], Any] | None = None
    choices: tuple[str, ...] = field(default=())
    validate: Callable[[Any, dict[str, Any]], str | None] | None = None
    when: Callable[[dict[str, Any]], bool] | None = None
    help: str = ""

    def applies(self, answers: dict[str, Any]) -> bool:
        """這題在目前的答案下要不要問。"""
        return self.when is None or bool(self.when(answers))

    def resolve_default(self, answers: dict[str, Any]) -> Any:
        """算出這題的預設值；沒有預設值回傳 ``None``。"""
        default = self.default
        if callable(default):
            default = default(answers)
        if isinstance(default, str):
            default = interpolate(default, answers)
        return default

    def coerce(self, raw: Any) -> Any:
        """把使用者輸入（或旗標字串）轉成這題的型別，失敗丟 ``ValueError``。"""
        if self.type == "bool":
            if isinstance(raw, bool):
                return raw
            word = str(raw).strip().lower()
            if word in _TRUE_WORDS:
                return True
            if word in _FALSE_WORDS:
                return False
            raise ValueError("請回答 y 或 n")
        if self.type == "int":
            if isinstance(raw, bool):
                raise ValueError("需要一個整數")
            try:
                return int(str(raw).strip())
            except ValueError:
                raise ValueError("需要一個整數") from None
        value = raw if isinstance(raw, str) else str(raw)
        value = value.strip()
        if self.type == "choice" and self.choices and value not in self.choices:
            raise ValueError("只能是：" + " / ".join(self.choices))
        return value

    def check(self, value: Any, answers: dict[str, Any]) -> str | None:
        """跑 ``validate``；通過回傳 ``None``，否則回傳錯誤訊息。"""
        if self.validate is None:
            return None
        return self.validate(value, answers)

    def display_prompt(self, answers: dict[str, Any]) -> str:
        """組出終端機上要顯示的那一行。"""
        default = self.resolve_default(answers)
        parts = [self.prompt]
        if self.type == "choice" and self.choices:
            parts.append("(" + "/".join(self.choices) + ")")
        if self.type == "bool":
            parts.append("[Y/n]" if default else "[y/N]")
        elif default not in (None, ""):
            parts.append(f"[{default}]")
        return " ".join(parts) + ": "


def _is_provided(value: Any) -> bool:
    return value is not None


def ask_all(
    questions: Iterable[Question],
    answers: dict[str, Any] | None = None,
    *,
    reader: Callable[[str], str] | None = None,
    writer: Callable[[str], None] | None = None,
    interactive: bool | None = None,
) -> dict[str, Any]:
    """依序處理每一題，回傳完整答案字典。

    已經在 ``answers`` 裡的題目不再詢問；``when`` 為假的題目會從結果中移除。
    非互動模式下缺必填項時丟 :class:`MissingAnswers`，同一題連續失敗
    :data:`MAX_ATTEMPTS` 次丟 :class:`AskAborted`。
    """
    result: dict[str, Any] = dict(answers or {})
    if interactive is None:
        interactive = sys.stdin is not None and sys.stdin.isatty()
    if reader is None:
        reader = input
    if writer is None:

        def writer(line: str) -> None:
            print(line, file=sys.stderr)

    missing: list[str] = []

    for question in questions:
        if not question.applies(result):
            # 條件為假：既不問、也不套預設值，而且不能留在結果裡。
            result.pop(question.key, None)
            continue

        given = result.get(question.key)
        if _is_provided(given):
            try:
                value = question.coerce(given)
            except ValueError as exc:
                if not interactive:
                    raise AskAborted(question.key, str(exc)) from None
                writer(f"× {exc}")
            else:
                error = question.check(value, result)
                if error is None:
                    result[question.key] = value
                    continue
                if not interactive:
                    raise AskAborted(question.key, error) from None
                writer(f"× {error}")

        if not interactive:
            default = question.resolve_default(result)
            if _is_provided(default):
                result[question.key] = question.coerce(default)
            else:
                result.pop(question.key, None)
                missing.append(question.key)
            continue

        result[question.key] = _ask_one(question, result, reader, writer)

    if missing:
        raise MissingAnswers(missing)
    return result


def _ask_one(
    question: Question,
    answers: dict[str, Any],
    reader: Callable[[str], str],
    writer: Callable[[str], None],
) -> Any:
    """互動模式下問一題，最多 :data:`MAX_ATTEMPTS` 次。"""
    if question.help:
        writer(question.help)
    last_error = ""
    for _ in range(MAX_ATTEMPTS):
        try:
            raw = reader(question.display_prompt(answers))
        except EOFError:
            raise AskAborted(question.key, "輸入已結束") from None
        default = question.resolve_default(answers)
        if str(raw).strip() == "":
            if not _is_provided(default):
                last_error = "這題沒有預設值，必須填"
                writer(f"× {last_error}")
                continue
            raw = default
        try:
            value = question.coerce(raw)
        except ValueError as exc:
            last_error = str(exc)
            writer(f"× {last_error}")
            continue
        error = question.check(value, answers)
        if error is not None:
            last_error = error
            writer(f"× {last_error}")
            continue
        return value
    raise AskAborted(question.key, last_error)
