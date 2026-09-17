"""命令列進入點。

argparse 的參數**完全由問題定義自動產生**——新增一題只改 :mod:`presets`，
``--help`` 會自己長出來。這裡不准出現第二份問題清單。
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from . import __version__
from .postactions import next_steps, run_post_actions
from .presets import PRESETS, Preset, build_flags, build_variables, get_preset
from .questions import AskError, Question, ask_all
from .render import RenderError, render_tree

PROG = "smart-scaffold"


def flag_for(key: str) -> str:
    """``python_version`` → ``--python-version``。"""
    return "--" + key.replace("_", "-")


def help_for(question: Question) -> str:
    """``--help`` 一行：提示文字 + 預設值。"""
    default = question.default
    if default is None:
        hint = "必填"
    elif callable(default):
        hint = "自動偵測"
    elif isinstance(default, bool):
        hint = "是" if default else "否"
    else:
        hint = str(default)
    return f"{question.prompt}（預設：{hint}）"


def add_question_arguments(parser: argparse.ArgumentParser, questions: Sequence[Question]) -> None:
    """把問題定義掛成 CLI 旗標。"""
    for question in questions:
        flag = flag_for(question.key)
        common: dict[str, Any] = {
            "dest": question.key,
            "default": None,
            "help": help_for(question),
        }
        if question.type == "bool":
            parser.add_argument(flag, action=argparse.BooleanOptionalAction, **common)
        elif question.type == "int":
            parser.add_argument(flag, type=int, metavar=question.key.upper(), **common)
        elif question.type == "choice":
            parser.add_argument(flag, choices=list(question.choices), **common)
        else:
            parser.add_argument(flag, metavar=question.key.upper(), **common)


def build_parser(presets: dict[str, Preset] | None = None) -> argparse.ArgumentParser:
    """組出整個 parser；每個 preset 一個子命令。"""
    presets = PRESETS if presets is None else presets
    parser = argparse.ArgumentParser(
        prog=PROG,
        description="逐步問答問完該問的，然後生出一個可以直接動工的專案骨架。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--version", action="version", version=f"{PROG} {__version__}")
    subparsers = parser.add_subparsers(dest="preset", metavar="PRESET")
    made: dict[str, argparse.ArgumentParser] = {}

    for key in sorted(presets):
        preset = presets[key]
        sub = subparsers.add_parser(
            key,
            help=preset.summary,
            description=preset.summary,
            # 不用 ArgumentDefaultsHelpFormatter：旗標的真正預設值是 None
            # （代表「沒給」），印出來只會變成一堆沒意義的 (default: None)。
            # 真正的預設值由 help_for() 從問題定義取出來。
            formatter_class=argparse.RawDescriptionHelpFormatter,
        )
        add_question_arguments(sub, preset.questions)
        sub.add_argument(
            "--yes",
            "-y",
            action="store_true",
            help="不互動問答，沒給的項目一律用預設值",
        )
        made[key] = sub

    # 讓測試（與未來的 renderer）拿得到每個 preset 的子 parser，不必戳私有屬性。
    parser.preset_parsers = made  # type: ignore[attr-defined]
    return parser


def answers_from_args(args: argparse.Namespace, preset: Preset) -> dict[str, Any]:
    """只挑出使用者真的有給的旗標；沒給的留給問答或預設值。"""
    values = vars(args)
    return {q.key: values[q.key] for q in preset.questions if values.get(q.key) is not None}


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if not getattr(args, "preset", None):
        parser.print_help()
        return 2

    try:
        preset = get_preset(args.preset)
    except KeyError as exc:
        print(f"× {exc}", file=sys.stderr)
        return 2

    if not preset.ready:
        print(
            f"× preset「{preset.key}」的模板還沒有內容（{preset.summary}）。",
            file=sys.stderr,
        )
        return 2

    interactive = False if args.yes else None
    try:
        answers = ask_all(
            preset.questions,
            answers_from_args(args, preset),
            interactive=interactive,
        )
    except AskError as exc:
        print(f"× {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\n已取消。", file=sys.stderr)
        return 130

    target = Path(str(answers["path"])).expanduser().resolve()
    variables = build_variables(answers)

    try:
        written = render_tree(preset.template_dir, target, variables, build_flags(answers))
    except RenderError as exc:
        print(f"× {exc}", file=sys.stderr)
        return 1

    print(f"✓ 已產生 {len(written)} 個檔案於 {target}")

    report = run_post_actions(
        target,
        name=str(answers["name"]),
        description=str(answers.get("description") or ""),
        install=bool(answers.get("install", True)),
        install_steps=preset.install_steps,
        use_git=bool(answers.get("git", True)),
    )

    print()
    for warning in report.warnings:
        print(f"! {warning}")
    if report.warnings:
        print()
    print(
        next_steps(
            target,
            install_ok=report.install.ok,
            install_steps=preset.install_steps,
            verify_commands=preset.verify_commands,
        )
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
