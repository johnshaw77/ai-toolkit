# {{name}}

{{description}}

## 專案概述

這個骨架由 smart-scaffold 生成，形態是「`uv` + `src/` 套件分層 + `scripts/`
entry point + `config/` 設定分層」。設定分兩層：不含秘密的放
`config/settings.yaml`（進版控），秘密放 `.env`（不進版控，範本是
`.env.example`）。

功能還沒開始寫——先用 `/unattended:spec` 把第一輪要做的東西談成一份 `SPEC.md`，
再動手。

## 核心功能

- **設定載入**：`config/settings.yaml` 與 `.env` 兩層合併，`.env` 優先。
- **entry point**：`uv run {{name}}` 或 `uv run python scripts/run.py`，兩條路都通。
- **測試骨架**：`tests/` 已經有可以跑的樣板測試，加新測試照著抄。
- **一致的檢查**：`make check` 一次跑完 ruff 與 pytest。

## 技術棧

| 項目 | 選用 |
|---|---|
| 語言 | Python {{python_version}} |
| 套件與環境管理 | uv |
| 設定 | PyYAML + python-dotenv |
| 測試 | pytest |
| Lint / Format | ruff（line-length 100） |

## 專案結構

```
{{name}}/
├── config/
│   └── settings.yaml        # 不含秘密的設定，進版控
├── scripts/
│   └── run.py               # 手動跑一次的 entry point
├── src/
│   └── {{name}}/
│       ├── __init__.py
│       ├── __main__.py      # uv run {{name}} 走這裡
│       └── config.py        # 設定載入
├── tests/                   # pytest，testpaths 指到這裡
├── .env.example             # 複製成 .env 再改
├── Makefile                 # make help 看有哪些指令
└── pyproject.toml
```

## 快速開始

```bash
uv sync --extra dev          # 建虛擬環境並裝依賴
cp .env.example .env         # 需要秘密設定時才要做

uv run {{name}}              # 跑起來看看
uv run pytest                # 測試
uv run ruff check .          # lint
make check                   # lint + 測試一起跑
```

服務埠預設 {{port}}——建立專案時已經避開機器上正在用的埠了。
