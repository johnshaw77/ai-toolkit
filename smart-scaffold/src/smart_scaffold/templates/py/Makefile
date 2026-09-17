# 常用指令。全部透過 uv 跑，不用先 activate 虛擬環境。
.PHONY: help install test lint fmt check run

help:
	@echo "install  安裝依賴（含 dev）"
	@echo "test     跑測試"
	@echo "lint     ruff 檢查"
	@echo "fmt      ruff 自動修正 + 排版"
	@echo "check    lint + test"
	@echo "run      跑 scripts/run.py"

install:
	uv sync --extra dev

test:
	uv run pytest

lint:
	uv run ruff check .

fmt:
	uv run ruff check --fix .
	uv run ruff format .

check:
	$(MAKE) lint
	$(MAKE) test

run:
	uv run python scripts/run.py
