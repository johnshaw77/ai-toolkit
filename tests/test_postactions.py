"""F6 後置動作：裝依賴 / git init / 第一顆 commit。"""

from __future__ import annotations

import subprocess

import pytest

from smart_scaffold.postactions import (
    InstallStep,
    check_clean_for_commit,
    commit_message_for,
    first_commit,
    init_git,
    install_dependencies,
    next_steps,
    run_post_actions,
)

NO_SUCH_COMMAND = "smart-scaffold-definitely-not-a-real-command"


def _has_git() -> bool:
    try:
        subprocess.run(["git", "--version"], capture_output=True, check=False)
    except OSError:
        return False
    return True


needs_git = pytest.mark.skipif(not _has_git(), reason="這台機器沒有 git")


def _project(tmp_path):
    project = tmp_path / "demo_tool"
    project.mkdir()
    (project / ".gitignore").write_text(".venv/\n.env\n", encoding="utf-8")
    (project / "README.md").write_text("# demo_tool\n", encoding="utf-8")
    return project


def test_裝依賴失敗不中止只回報(tmp_path):
    steps = (InstallStep("Python 依賴", (NO_SUCH_COMMAND, "sync")),)
    result = install_dependencies(_project(tmp_path), steps, writer=lambda _line: None)
    assert result.ok is False
    assert "依賴沒裝成功" in result.message


def test_commit_訊息是繁體中文且不含_initial_commit():
    message = commit_message_for("demo_tool")
    title = message.splitlines()[0]
    assert "Initial commit" not in message
    assert any("一" <= ch <= "鿿" for ch in title)


@needs_git
def test_git_init_出來的分支是_main(tmp_path):
    project = _project(tmp_path)
    assert init_git(project).ok is True
    branch = subprocess.run(
        ["git", "symbolic-ref", "--short", "HEAD"],
        cwd=project,
        capture_output=True,
        text=True,
        check=True,
    )
    assert branch.stdout.strip() == "main"


@needs_git
def test_第一顆_commit_做得出來而且訊息是中文(tmp_path):
    project = _project(tmp_path)
    init_git(project)
    assert first_commit(project, commit_message_for("demo_tool")).ok is True
    subject = subprocess.run(
        ["git", "log", "-1", "--pretty=%s"],
        cwd=project,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    assert subject == "建立 demo_tool 專案骨架"


@needs_git
def test_venv_沒被_gitignore_擋住時不_commit(tmp_path):
    project = _project(tmp_path)
    (project / ".gitignore").write_text("# 什麼都沒擋\n", encoding="utf-8")
    (project / ".venv").mkdir()
    (project / ".venv" / "pyvenv.cfg").write_text("x\n", encoding="utf-8")
    init_git(project)
    assert check_clean_for_commit(project) is not None
    assert first_commit(project, "訊息").ok is False


def test_沒有_gitignore_就不敢_commit(tmp_path):
    project = tmp_path / "空專案"
    project.mkdir()
    assert "沒有 .gitignore" in (check_clean_for_commit(project) or "")


def test_git_不存在時只是回報失敗(tmp_path):
    result = init_git(_project(tmp_path), git_cmd=NO_SUCH_COMMAND)
    assert result.ok is False


def test_下一步含有可複製的指令並提到_unattended_spec(tmp_path):
    text = next_steps(tmp_path / "demo_tool", install_ok=True)
    assert f"cd {tmp_path / 'demo_tool'}" in text
    assert "uv run pytest" in text
    assert "/unattended:spec" in text


def test_裝依賴失敗時下一步會叫使用者自己跑_uv_sync(tmp_path):
    text = next_steps(tmp_path / "demo_tool", install_ok=False)
    assert "uv sync --extra dev" in text


def test_兩個旗標各自跳過對應步驟(tmp_path):
    lines: list[str] = []
    report = run_post_actions(
        _project(tmp_path),
        name="demo_tool",
        install=False,
        use_git=False,
        writer=lines.append,
    )
    assert report.install.skipped and report.git.skipped
    assert report.warnings == []
    assert any("--no-install" in line for line in lines)
    assert any("--no-git" in line for line in lines)


def test_裝依賴失敗時總結裡會明講(tmp_path):
    report = run_post_actions(
        _project(tmp_path),
        name="demo_tool",
        install=True,
        use_git=False,
        writer=lambda _line: None,
        install_steps=(InstallStep("Python 依賴", (NO_SUCH_COMMAND, "sync")),),
    )
    assert report.install.ok is False
    assert any(NO_SUCH_COMMAND in w for w in report.warnings)


def test_多包依賴分別安裝而且各自回報(tmp_path):
    """全端專案有前後端兩包依賴，一包壞掉不能拖垮另一包。"""
    project = _project(tmp_path)
    (project / "backend").mkdir()
    (project / "frontend").mkdir()
    lines: list[str] = []
    result = install_dependencies(
        project,
        (
            InstallStep("後端依賴", ("true",), "backend"),
            InstallStep("前端依賴", (NO_SUCH_COMMAND, "install"), "frontend"),
        ),
        writer=lines.append,
    )
    assert result.ok is False
    assert "前端依賴" in result.message
    assert any("✓ 後端依賴 已安裝" in line for line in lines)


def test_安裝步驟的資料夾不存在時只回報不炸(tmp_path):
    result = install_dependencies(
        _project(tmp_path),
        (InstallStep("前端依賴", ("npm", "install"), "frontend"),),
        writer=lambda _line: None,
    )
    assert result.ok is False
    assert "找不到 frontend/" in result.message


def test_下一步會照_preset_給的指令印(tmp_path):
    text = next_steps(
        tmp_path / "demo",
        install_ok=False,
        install_steps=(InstallStep("前端依賴", ("npm", "install"), "frontend"),),
        verify_commands=("npm run build",),
    )
    assert "cd frontend && npm install" in text
    assert "npm run build" in text
