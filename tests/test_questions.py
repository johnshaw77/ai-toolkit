"""F1 問題定義引擎。

這裡的測試**一律不碰終端機**：用預先填好的答案字典，或注入假的 reader。
"""

from __future__ import annotations

import pytest

from smart_scaffold.questions import (
    MAX_ATTEMPTS,
    AskAborted,
    MissingAnswers,
    Question,
    ask_all,
    interpolate,
)


def _reader(*responses: str):
    """做一個假的 reader，照順序吐出預先寫好的回答。"""
    queue = list(responses)

    def read(_prompt: str) -> str:
        if not queue:
            raise EOFError
        return queue.pop(0)

    return read


def _silent(_line: str) -> None:
    return None


NAME = Question(key="name", prompt="專案名稱")


def test_預填答案不需要任何輸入():
    reader = _reader()  # 一被呼叫就 EOFError，證明根本沒問
    answers = ask_all([NAME], {"name": "demo"}, reader=reader, writer=_silent)
    assert answers == {"name": "demo"}


def test_字串答案會去掉前後空白():
    answers = ask_all([NAME], {"name": "  demo  "}, interactive=False, writer=_silent)
    assert answers["name"] == "demo"


def test_when_為假的題目不會出現在結果裡():
    questions = [
        Question(key="service", prompt="要服務嗎", type="bool", default=False),
        Question(
            key="port",
            prompt="埠",
            type="int",
            default=8000,
            when=lambda a: bool(a.get("service")),
        ),
    ]
    answers = ask_all(questions, {"service": False}, interactive=False, writer=_silent)
    assert "port" not in answers


def test_when_為假時就算旗標有給也會被拿掉():
    questions = [
        Question(key="service", prompt="要服務嗎", type="bool", default=False),
        Question(
            key="port",
            prompt="埠",
            type="int",
            when=lambda a: bool(a.get("service")),
        ),
    ]
    answers = ask_all(
        questions, {"service": False, "port": 9999}, interactive=False, writer=_silent
    )
    assert "port" not in answers


def test_when_為真時照樣套用預設值():
    questions = [
        Question(key="service", prompt="要服務嗎", type="bool", default=True),
        Question(
            key="port",
            prompt="埠",
            type="int",
            default=8123,
            when=lambda a: bool(a.get("service")),
        ),
    ]
    answers = ask_all(questions, {}, interactive=False, writer=_silent)
    assert answers["port"] == 8123


def test_validate_失敗會重問同一題而不是往下走():
    asked: list[str] = []

    def reader(prompt: str) -> str:
        asked.append(prompt)
        return ["壞的", "壞的", "好的"][len(asked) - 1]

    question = Question(
        key="name",
        prompt="專案名稱",
        validate=lambda v, _a: None if v == "好的" else "不接受這個值",
    )
    answers = ask_all([question], {}, reader=reader, writer=_silent, interactive=True)
    assert answers["name"] == "好的"
    assert len(asked) == 3


def test_連續失敗三次就放棄():
    question = Question(key="name", prompt="專案名稱", validate=lambda _v, _a: "永遠不過")
    with pytest.raises(AskAborted) as excinfo:
        ask_all([question], {}, reader=_reader("a", "b", "c"), writer=_silent, interactive=True)
    assert excinfo.value.key == "name"
    assert str(MAX_ATTEMPTS) in str(excinfo.value)


def test_放棄之後後面的題目不會被問到():
    seen: list[str] = []
    questions = [
        Question(key="name", prompt="專案名稱", validate=lambda _v, _a: "永遠不過"),
        Question(key="後面這題", prompt="不該被問到"),
    ]

    def reader(prompt: str) -> str:
        seen.append(prompt)
        return "x"

    with pytest.raises(AskAborted):
        ask_all(questions, {}, reader=reader, writer=_silent, interactive=True)
    assert all("不該被問到" not in prompt for prompt in seen)


def test_預設值支援引用前面答案的插值():
    questions = [
        NAME,
        Question(key="path", prompt="路徑", default="~/Desktop/@SideProjects/{name}"),
    ]
    answers = ask_all(questions, {"name": "demo"}, interactive=False, writer=_silent)
    assert answers["path"] == "~/Desktop/@SideProjects/demo"


def test_插值找不到對應答案時原樣保留():
    assert interpolate("{name}/{沒有這個}", {"name": "demo"}) == "demo/{沒有這個}"


def test_可呼叫的預設值拿得到目前的答案():
    question = Question(key="port", prompt="埠", type="int", default=lambda a: len(a["name"]))
    answers = ask_all([NAME, question], {"name": "demo"}, interactive=False, writer=_silent)
    assert answers["port"] == 4


def test_直接按_enter_就用預設值():
    questions = [NAME, Question(key="path", prompt="路徑", default="{name}-dir")]
    answers = ask_all(
        questions, {"name": "demo"}, reader=_reader(""), writer=_silent, interactive=True
    )
    assert answers["path"] == "demo-dir"


def test_沒有預設值又直接按_enter_會重問():
    answers = ask_all([NAME], {}, reader=_reader("", "demo"), writer=_silent, interactive=True)
    assert answers["name"] == "demo"


@pytest.mark.parametrize("word,expected", [("y", True), ("yes", True), ("n", False), ("否", False)])
def test_布林題接受常見的說法(word, expected):
    question = Question(key="git", prompt="要 git 嗎", type="bool")
    answers = ask_all([question], {"git": word}, interactive=False, writer=_silent)
    assert answers["git"] is expected


def test_布林題碰到看不懂的字會重問():
    question = Question(key="git", prompt="要 git 嗎", type="bool")
    answers = ask_all(
        [question], {}, reader=_reader("也許吧", "y"), writer=_silent, interactive=True
    )
    assert answers["git"] is True


def test_單選題只收清單裡的選項():
    question = Question(
        key="python_version", prompt="版本", type="choice", choices=("3.12", "3.13")
    )
    answers = ask_all(
        [question], {}, reader=_reader("2.7", "3.12"), writer=_silent, interactive=True
    )
    assert answers["python_version"] == "3.12"


def test_整數題會轉型():
    question = Question(key="port", prompt="埠", type="int")
    answers = ask_all([question], {"port": "8123"}, interactive=False, writer=_silent)
    assert answers["port"] == 8123


def test_非互動模式缺必填項會列出缺哪幾個():
    questions = [NAME, Question(key="owner", prompt="負責人")]
    with pytest.raises(MissingAnswers) as excinfo:
        ask_all(questions, {}, interactive=False, writer=_silent)
    assert excinfo.value.keys == ["name", "owner"]
    assert "--name" in str(excinfo.value)
    assert "--owner" in str(excinfo.value)


def test_非互動模式下旗標值不合法會直接中止():
    question = Question(key="name", prompt="專案名稱", validate=lambda _v, _a: "不行")
    with pytest.raises(AskAborted):
        ask_all([question], {"name": "x"}, interactive=False, writer=_silent)


def test_輸入提早結束時不會卡住():
    with pytest.raises(AskAborted):
        ask_all([NAME], {}, reader=_reader(), writer=_silent, interactive=True)


def test_顯示用的提示帶著預設值():
    question = Question(key="path", prompt="路徑", default="{name}-dir")
    assert question.display_prompt({"name": "demo"}) == "路徑 [demo-dir]: "


def test_布林題的提示會反映預設值():
    yes = Question(key="git", prompt="要 git 嗎", type="bool", default=True)
    no = Question(key="git", prompt="要 git 嗎", type="bool", default=False)
    assert yes.display_prompt({}).endswith("[Y/n]: ")
    assert no.display_prompt({}).endswith("[y/N]: ")


def test_題目順序決定答案順序():
    questions = [NAME, Question(key="path", prompt="路徑", default="{name}")]
    answers = ask_all(questions, {"name": "demo"}, interactive=False, writer=_silent)
    assert list(answers) == ["name", "path"]
