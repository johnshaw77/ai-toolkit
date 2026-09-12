# 前後端都從專案根目錄操作，不用先 cd 進去。
.PHONY: help install dev api web test lint fmt check build

help:
	@echo "install  裝前後端依賴"
	@echo "dev      同時跑後端與前端（需要兩個終端機時請分別跑 api / web）"
	@echo "api      只跑後端（http://127.0.0.1:{{backend_port}}）"
	@echo "web      只跑前端（http://localhost:{{frontend_port}}）"
	@echo "test     跑後端測試與前端單元測試"
	@echo "e2e      跑端對端測試（會自己把前後端跑起來）"
	@echo "lint     ruff + eslint"
	@echo "fmt      自動修正與排版"
	@echo "check    lint + test + 前端建置"
	@echo "build    建置前端"

install:
	cd backend && uv sync --extra dev
	cd frontend && npm install

api:
	cd backend && uv run uvicorn app.main:app --reload --port {{backend_port}}

web:
	cd frontend && npm run dev

dev:
	@echo "請開兩個終端機，分別跑：$(MAKE) api 與 $(MAKE) web"

test:
	cd backend && uv run pytest
	cd frontend && npm test

# 第一次跑之前要先裝瀏覽器：cd frontend && npm run e2e:install
e2e:
	cd frontend && npm run e2e

lint:
	cd backend && uv run ruff check .
	cd frontend && npm run lint

fmt:
	cd backend && uv run ruff check --fix . && uv run ruff format .
	cd frontend && npm run format

build:
	cd frontend && npm run build

check:
	$(MAKE) lint
	$(MAKE) test
	$(MAKE) build
	$(MAKE) e2e
