# 全部透過 uv 跑，不用先 activate 虛擬環境。
.PHONY: help install run dev init seed test e2e lint fmt check up down logs ps

help:
	@echo "install  安裝依賴（含 dev）"
	@echo "init     建立資料庫與初始資料"
	@echo "run      跑服務（http://127.0.0.1:{{port}}）"
	@echo "dev      同上，但改檔案會自動重載"
	@echo "test     跑單元與 API 測試"
	@echo "e2e      跑端對端測試（要先 make e2e-install）"
	@echo "lint     ruff 檢查"
	@echo "fmt      ruff 自動修正 + 排版"
	@echo "check    lint + test + e2e"
	@echo ""
	@echo "容器版（埠跟本機開發的錯開，兩邊可以同時跑）："
	@echo "  up / down / logs / ps"

install:
	uv sync --extra dev

e2e-install:
	uv run playwright install chromium

init:
	uv run {{name}} init
	uv run {{name}} seed

run:
	uv run {{name}} serve

dev:
	uv run uvicorn {{name}}.api:create_app --factory --reload --port {{port}}

test:
	uv run pytest

e2e:
	uv run pytest -m e2e

lint:
	uv run ruff check .

fmt:
	uv run ruff check --fix .
	uv run ruff format .

check:
	$(MAKE) lint
	$(MAKE) test
	$(MAKE) e2e

up:
	docker compose up -d --build
	docker compose ps

down:
	docker compose down

logs:
	docker compose logs -f --tail=50

ps:
	docker compose ps
