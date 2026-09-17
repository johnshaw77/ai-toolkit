"""F4 模板渲染器。"""

from __future__ import annotations

import os
import stat

import pytest

from smart_scaffold.render import (
    MissingVariableError,
    TargetExistsError,
    UnbalancedConditionError,
    apply_conditions,
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


# --------------------------------------------------------------- 條件式內容


def test_條件成立時只拿掉標記那幾行():
    """生出來的專案不該看到標記本身。"""
    source = "前\n# scaffold:if demo\n示範\n# scaffold:endif\n後\n"
    assert apply_conditions(source, {"demo": True}, source="a.py") == "前\n示範\n後\n"


def test_條件不成立時整段拿掉():
    source = "前\n# scaffold:if demo\n示範\n# scaffold:endif\n後\n"
    assert apply_conditions(source, {"demo": False}, source="a.py") == "前\n後\n"


def test_沒提到的旗標當成假():
    source = "前\n# scaffold:if demo\n示範\n# scaffold:endif\n後\n"
    assert apply_conditions(source, {}, source="a.py") == "前\n後\n"


def test_各種註解符號都認得():
    """Python、JS、Jinja 的註解長得都不一樣，但標記是同一串字。"""
    for opening, closing in [("# ", ""), ("// ", ""), ("{# ", " #}"), ("<!-- ", " -->")]:
        source = f"前\n{opening}scaffold:if demo{closing}\n示範\n{opening}scaffold:endif{closing}\n"
        assert apply_conditions(source, {"demo": False}, source="a") == "前\n"


def test_巢狀的條件區段():
    source = (
        "a\n# scaffold:if outer\nb\n# scaffold:if inner\nc\n"
        "# scaffold:endif\nd\n# scaffold:endif\ne\n"
    )
    both = apply_conditions(source, {"outer": True, "inner": True}, source="a")
    assert both == "a\nb\nc\nd\ne\n"
    outer_only = apply_conditions(source, {"outer": True, "inner": False}, source="a")
    assert outer_only == "a\nb\nd\ne\n"
    assert apply_conditions(source, {}, source="a") == "a\ne\n"


def test_標記不成對會中止並指出是哪個檔案():
    with pytest.raises(UnbalancedConditionError, match="a.py"):
        apply_conditions("# scaffold:if demo\nx\n", {"demo": True}, source="a.py")
    with pytest.raises(UnbalancedConditionError, match="endif"):
        apply_conditions("# scaffold:endif\n", {}, source="a.py")


def test_沒有標記的檔案原封不動():
    source = "什麼都沒有\n"
    assert apply_conditions(source, {"demo": False}, source="a.py") == source


def test_整個檔案可以依旗標略過(tmp_path):
    template = tmp_path / "tpl"
    _write_template(
        template,
        {
            "keep.txt": "{{name}}\n",
            "demo/sample.txt": "示範\n",
            "tests/test_demo.txt": "示範測試\n",
        },
    )
    (template / ".scaffold.toml").write_text(
        '[optional]\ndemo = ["demo", "tests/test_demo.txt"]\n', encoding="utf-8"
    )

    with_demo = tmp_path / "with"
    render_tree(template, with_demo, VARS, {"demo": True})
    assert (with_demo / "demo" / "sample.txt").is_file()
    assert (with_demo / "tests" / "test_demo.txt").is_file()

    without = tmp_path / "without"
    render_tree(template, without, VARS, {"demo": False})
    assert (without / "keep.txt").is_file()
    assert not (without / "demo").exists()
    assert not (without / "tests" / "test_demo.txt").exists()


def test_模板自己的設定檔不會被複製進去(tmp_path):
    template = tmp_path / "tpl"
    _write_template(template, {"keep.txt": "x\n"})
    (template / ".scaffold.toml").write_text("[optional]\n", encoding="utf-8")

    target = tmp_path / "out"
    render_tree(template, target, VARS)
    assert not (target / ".scaffold.toml").exists()


def test_ifnot_是反過來的():
    source = "前\n# scaffold:ifnot demo\n沒有範例時才要的\n# scaffold:endif\n後\n"
    assert apply_conditions(source, {"demo": False}, source="a") == "前\n沒有範例時才要的\n後\n"
    assert apply_conditions(source, {"demo": True}, source="a") == "前\n後\n"


def test_ifnot_也要指定旗標():
    with pytest.raises(UnbalancedConditionError, match="ifnot"):
        apply_conditions("# scaffold:ifnot\nx\n# scaffold:endif\n", {}, source="a")
