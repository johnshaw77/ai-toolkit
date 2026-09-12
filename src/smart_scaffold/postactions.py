"""生成完檔案之後的事：裝依賴 → git init → 第一顆 commit → 印出下一步。

原則是**沒有一步可以害整支工具白跑**。沒網路裝不了依賴、機器上沒有 git，
都只是少做一步，最後在總結裡老實講。
"""

from __future__ import annotations

import subprocess
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

#: 裝依賴給的時間上限（秒）。第一次抓 Python 直譯器可能要一陣子。
INSTALL_TIMEOUT = 900.0
GIT_TIMEOUT = 60.0

#: git 找不到身分時用的備援，免得整顆 commit 做不出來。
FALLBACK_GIT_NAME = "smart-scaffold"
FALLBACK_GIT_EMAIL = "smart-scaffold@localhost"


@dataclass
class StepResult:
    """一個步驟做完的結果。``ok=False`` 不代表要中止，只代表要在總結裡講。"""

    ok: bool
    message: str
    skipped: bool = False


@dataclass
class PostActionReport:
    """整輪後置動作的總結。"""

    install: StepResult
    git: StepResult
    warnings: list[str] = field(default_factory=list)


def _run(
    args: list[str],
    cwd: Path,
    timeout: float,
) -> tuple[int, str]:
    """跑一個外部指令，回傳 ``(離開碼, 合併過的輸出)``；指令不存在回傳 ``(127, ...)``。"""
    try:
        completed = subprocess.run(  # noqa: S603
            args,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError:
        return 127, f"找不到指令 {args[0]}"
    except subprocess.TimeoutExpired:
        return 124, f"{args[0]} 逾時（超過 {timeout:.0f} 秒）"
    except OSError as exc:
        return 126, f"{args[0]} 無法執行：{exc}"
    output = (completed.stdout or "") + (completed.stderr or "")
    return completed.returncode, output.strip()


@dataclass(frozen=True)
class InstallStep:
    """一個安裝步驟。全端專案有前後端兩包依賴，所以這是清單不是單一指令。"""

    label: str
    args: tuple[str, ...]
    subdir: str = "."

    def command(self) -> str:
        """給人看的指令字串，失敗時要叫使用者自己跑的就是這個。"""
        return " ".join(self.args)


#: 沒有特別指定時就是單純的 uv 專案。
DEFAULT_INSTALL_STEPS: tuple[InstallStep, ...] = (
    InstallStep("Python 依賴", ("uv", "sync", "--extra", "dev")),
)


def install_dependencies(
    project_dir: Path,
    steps: Sequence[InstallStep] | None = None,
    *,
    writer: Callable[[str], None] = print,
) -> StepResult:
    """依序跑完每個安裝步驟。**任何一步失敗都不中止**，只回報。"""
    steps = DEFAULT_INSTALL_STEPS if steps is None else tuple(steps)
    failures: list[str] = []
    for step in steps:
        workdir = project_dir / step.subdir
        if not workdir.is_dir():
            failures.append(f"{step.label}：找不到 {step.subdir}/")
            continue
        writer(f"→ 安裝{step.label}中（{step.command()}）…")
        code, output = _run(list(step.args), workdir, INSTALL_TIMEOUT)
        if code == 0:
            writer(f"✓ {step.label}已安裝")
            continue
        tail = output.splitlines()[-1] if output else "沒有輸出"
        failures.append(f"{step.label}：{tail}")
        writer(f"! {step.label}沒裝成功：{tail}")

    if not failures:
        return StepResult(True, "依賴已安裝")
    return StepResult(False, "依賴沒裝成功——" + "；".join(failures))


def init_git(project_dir: Path, *, git_cmd: str = "git") -> StepResult:
    """``git init -b main``。舊版 git 不吃 ``-b``，退回 init + symbolic-ref。"""
    code, output = _run([git_cmd, "init", "-b", "main"], project_dir, GIT_TIMEOUT)
    if code == 0:
        return StepResult(True, "已建立 git repo（分支 main）")
    if code in (126, 127, 124):
        return StepResult(False, output)

    code, output = _run([git_cmd, "init"], project_dir, GIT_TIMEOUT)
    if code != 0:
        return StepResult(False, f"git init 失敗：{output}")
    code, output = _run(
        [git_cmd, "symbolic-ref", "HEAD", "refs/heads/main"], project_dir, GIT_TIMEOUT
    )
    if code != 0:
        return StepResult(False, f"分支改名成 main 失敗：{output}")
    return StepResult(True, "已建立 git repo（分支 main，舊版 git 走備援路徑）")


def _dirty_paths(project_dir: Path, git_cmd: str) -> list[str]:
    code, output = _run([git_cmd, "status", "--porcelain"], project_dir, GIT_TIMEOUT)
    if code != 0:
        return []
    paths: list[str] = []
    for line in output.splitlines():
        if len(line) < 4:
            continue
        path = line[3:].strip().strip('"')
        if " -> " in path:  # rename
            path = path.split(" -> ", 1)[1]
        paths.append(path)
    return paths


def _normalise(path: str) -> str:
    """把 git 吐出來的路徑整理成 ``a/b`` 這種形狀。

    注意不能用 ``lstrip("./")``——那是「去掉這幾個字元」，會把 ``.venv/`` 啃成
    ``venv``，剛好漏掉最該擋的東西。
    """
    normalised = path.replace("\\", "/")
    if normalised.startswith("./"):
        normalised = normalised[2:]
    return normalised.rstrip("/")


def check_clean_for_commit(project_dir: Path, *, git_cmd: str = "git") -> str | None:
    """commit 之前的安全檢查；有問題回傳原因字串。"""
    if not (project_dir / ".gitignore").is_file():
        return "專案裡沒有 .gitignore，不敢 commit"
    offenders = []
    for path in _dirty_paths(project_dir, git_cmd):
        normalised = _normalise(path)
        first = normalised.split("/", 1)[0]
        if first == ".venv" or normalised == ".env":
            offenders.append(normalised)
    if offenders:
        return "這些不該進版控的東西出現在 git status：" + "、".join(sorted(set(offenders)))
    return None


def commit_message_for(name: str, description: str = "") -> str:
    """第一顆 commit 的訊息，一律繁體中文。"""
    title = f"建立 {name} 專案骨架"
    body = "由 smart-scaffold 生成：uv 專案設定、src/ 套件分層、設定檔與樣板測試。"
    if description:
        body = f"{description}\n\n{body}"
    return f"{title}\n\n{body}\n"


def first_commit(
    project_dir: Path,
    message: str,
    *,
    git_cmd: str = "git",
) -> StepResult:
    """``git add -A`` 之後做第一顆 commit。"""
    reason = check_clean_for_commit(project_dir, git_cmd=git_cmd)
    if reason is not None:
        return StepResult(False, f"沒有 commit：{reason}")

    code, output = _run([git_cmd, "add", "-A"], project_dir, GIT_TIMEOUT)
    if code != 0:
        return StepResult(False, f"git add 失敗：{output}")

    args = [git_cmd]
    if not _has_git_identity(project_dir, git_cmd):
        args += [
            "-c",
            f"user.name={FALLBACK_GIT_NAME}",
            "-c",
            f"user.email={FALLBACK_GIT_EMAIL}",
        ]
    args += ["commit", "-m", message]
    code, output = _run(args, project_dir, GIT_TIMEOUT)
    if code != 0:
        return StepResult(False, f"git commit 失敗：{output}")
    return StepResult(True, "已產生第一顆 commit")


def _has_git_identity(project_dir: Path, git_cmd: str) -> bool:
    for key in ("user.name", "user.email"):
        code, output = _run([git_cmd, "config", "--get", key], project_dir, GIT_TIMEOUT)
        if code != 0 or not output.strip():
            return False
    return True


#: 沒特別指定時，印出來的驗證指令。
DEFAULT_VERIFY_COMMANDS: tuple[str, ...] = ("uv run pytest", "uv run ruff check .")


def next_steps(
    project_dir: Path,
    *,
    install_ok: bool,
    install_steps: Sequence[InstallStep] | None = None,
    verify_commands: Sequence[str] = DEFAULT_VERIFY_COMMANDS,
) -> str:
    """印在最後的下一步，必須是可以直接複製貼上的指令。"""
    lines = [
        "下一步：",
        "",
        f"  cd {project_dir}",
    ]
    if not install_ok:
        for step in install_steps or DEFAULT_INSTALL_STEPS:
            prefix = "" if step.subdir == "." else f"cd {step.subdir} && "
            lines.append(f"  {prefix}{step.command()}        # 剛才沒裝成功，請自己跑一次")
    lines += [f"  {command}" for command in verify_commands]
    lines += [
        "",
        "接著在那個資料夾裡開一個 Claude Code session：",
        "",
        "  /unattended:spec           # 把第一輪要做的東西談成 SPEC.md",
        "  /unattended:mode 依 SPEC.md 完成全部功能",
        "",
    ]
    return "\n".join(lines)


def run_post_actions(
    project_dir: Path,
    *,
    name: str,
    description: str = "",
    install: bool = True,
    install_steps: Sequence[InstallStep] | None = None,
    use_git: bool = True,
    writer: Callable[[str], None] = print,
    git_cmd: str = "git",
) -> PostActionReport:
    """依序跑完後置動作，並把過程印出來。"""
    if install:
        install_result = install_dependencies(project_dir, install_steps, writer=writer)
    else:
        install_result = StepResult(True, "依 --no-install 跳過安裝依賴", skipped=True)
        writer("✓ " + install_result.message)

    if use_git:
        git_result = init_git(project_dir, git_cmd=git_cmd)
        writer(("✓ " if git_result.ok else "! ") + git_result.message)
        if git_result.ok:
            commit = first_commit(
                project_dir, commit_message_for(name, description), git_cmd=git_cmd
            )
            writer(("✓ " if commit.ok else "! ") + commit.message)
            git_result = StepResult(
                git_result.ok and commit.ok,
                f"{git_result.message}；{commit.message}",
            )
    else:
        git_result = StepResult(True, "依 --no-git 跳過 git 初始化", skipped=True)
        writer("✓ " + git_result.message)

    report = PostActionReport(install=install_result, git=git_result)
    if not install_result.ok:
        commands = "、".join(
            f"`{step.command()}`（在 {step.subdir}/）"
            for step in (install_steps or DEFAULT_INSTALL_STEPS)
        )
        report.warnings.append(f"依賴沒裝成功，請自己跑：{commands}")
    if not git_result.ok:
        report.warnings.append("git 步驟沒完成，請自己 `git init -b main` 並 commit")
    return report
