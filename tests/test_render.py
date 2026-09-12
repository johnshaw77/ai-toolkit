"""F4 模板渲染器。"""

from __future__ import annotations

import os
import stat

import pytest

from smart_scaffold.render import (
    MissingVariableError,
    TargetExistsError,
    render_text,
    render_tree,
)

VARS = {"name": "demo_tool", "description": "一支示範工具", "port": 8123}


def test_基本替換():
    assert render_text("套件 {{name}} 啟動", VARS) == "套件 demo_tool 啟動"


def test_大括號裡有空白的就不是佔位符():
    """Vue 的插值長得一模一樣，靠空白分辨——這是刻意的，不是疏忽。"""
    assert render_text("{{ name }}", VARS) == "{{ name }}"
    assert render_text("{{ user.fullName }}", VARS) == "{{ user.fullName }}"


def test_同一個檔案裡可以同時有佔位符與_vue_插值():
    source = "<span>{{ brandInitial }}</span><script>const t = '{{name}}'</script>"
    expected = "<span>{{ brandInitial }}</span><script>const t = 'demo_tool'</script>"
    assert render_text(source, VARS) == expected


def test_makefile_的錢字號一字不變():
    source = "check:\n\t$(MAKE) lint\n\techo $$HOME\n\tprice=$1.00\n"
    assert render_text(source, VARS) == source


def test_未定義的變數會中止並指出是哪個檔案哪個變數():
    with pytest.raises(MissingVariableError) as excinfo:
        render_text("{{沒定義}}{{author}}", VARS, source="README.md")
    assert excinfo.value.variable == "author"
    assert excinfo.value.source == "README.md"


def test_非英數的佔位符不算佔位符():
    # 只有合法識別字才是變數，其他原樣留著，免得誤判 Go template 之類的東西。
    assert render_text("{{ .Ports }}", VARS) == "{{ .Ports }}"


def _write_template(root, files: dict[str, str]):
    for relative, content in files.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


def test_整棵樹複製過去而且內容被替換(tmp_path):
    template = tmp_path / "tpl"
    _write_template(
        template,
        {
            "README.md": "# {{name}}\n{{description}}\n",
            "src/pkg/mod.py": "PORT = {{port}}\n",
        },
    )
    target = tmp_path / "out"
    written = render_tree(template, target, VARS)

    assert (target / "README.md").read_text(encoding="utf-8") == "# demo_tool\n一支示範工具\n"
    assert (target / "src/pkg/mod.py").read_text(encoding="utf-8") == "PORT = 8123\n"
    assert len(written) == 2


def test_檔名與資料夾名也會被替換(tmp_path):
    template = tmp_path / "tpl"
    _write_template(
        template,
        {
            "{{name}}.code-workspace": "{}\n",
            "src/{{name}}/__init__.py": "",
        },
    )
    target = tmp_path / "out"
    render_tree(template, target, VARS)

    assert (target / "demo_tool.code-workspace").is_file()
    assert (target / "src" / "demo_tool" / "__init__.py").is_file()
    assert not (target / "src" / "{{name}}").exists()


def test_檔名用到未定義的變數也會中止(tmp_path):
    template = tmp_path / "tpl"
    _write_template(template, {"{{unknown}}.txt": "x"})
    with pytest.raises(MissingVariableError):
        render_tree(template, tmp_path / "out", VARS)


def test_渲染完不該留下任何佔位符(tmp_path):
    template = tmp_path / "tpl"
    _write_template(template, {"a.txt": "{{name}} {{port}}\n"})
    target = tmp_path / "out"
    render_tree(template, target, VARS)
    assert "{{" not in (target / "a.txt").read_text(encoding="utf-8")


def test_目標已存在且非空時不覆蓋(tmp_path):
    template = tmp_path / "tpl"
    _write_template(template, {"a.txt": "new\n"})
    target = tmp_path / "out"
    target.mkdir()
    (target / "已經有東西.txt").write_text("原本的內容", encoding="utf-8")

    with pytest.raises(TargetExistsError):
        render_tree(template, target, VARS)
    assert (target / "已經有東西.txt").read_text(encoding="utf-8") == "原本的內容"


def test_目標是空資料夾時可以繼續(tmp_path):
    template = tmp_path / "tpl"
    _write_template(template, {"a.txt": "{{name}}\n"})
    target = tmp_path / "out"
    target.mkdir()
    render_tree(template, target, VARS)
    assert (target / "a.txt").read_text(encoding="utf-8") == "demo_tool\n"


def test_二進位檔原樣複製不做替換(tmp_path):
    template = tmp_path / "tpl"
    template.mkdir()
    blob = bytes([0x89, 0x50, 0x4E, 0x47, 0x00, 0xFF, 0xFE, 0x7B, 0x7B])
    (template / "logo.png").write_bytes(blob)
    target = tmp_path / "out"
    render_tree(template, target, VARS)
    assert (target / "logo.png").read_bytes() == blob


@pytest.mark.skipif(os.name == "nt", reason="Windows 沒有 POSIX 權限位元")
def test_可執行權限保留(tmp_path):
    template = tmp_path / "tpl"
    _write_template(template, {"run.sh": "#!/bin/sh\necho {{name}}\n"})
    (template / "run.sh").chmod(0o755)
    target = tmp_path / "out"
    render_tree(template, target, VARS)
    mode = (target / "run.sh").stat().st_mode
    assert mode & stat.S_IXUSR


def test_找不到模板資料夾會明講(tmp_path):
    with pytest.raises(Exception, match="找不到模板資料夾"):
        render_tree(tmp_path / "沒這個", tmp_path / "out", VARS)
