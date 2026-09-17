# 單一映像：uvicorn 直接送靜態檔，不另外擺一台 nginx。
# 這類內部工具的流量不需要那一層，少一個服務就少一份設定要維護。
FROM python:{{python_version}}-slim

COPY --from=ghcr.io/astral-sh/uv:0.5.14 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    DATABASE_PATH=/data/{{name}}.db

# 虛擬環境放 /opt，不要放 /app——/app 會被 bind mount 蓋掉。
RUN uv venv /opt/venv

WORKDIR /app

# 先只複製依賴宣告，改程式碼時才不會讓依賴那層的快取失效。
COPY pyproject.toml README.md ./
RUN uv pip install -r pyproject.toml

COPY . .
RUN uv pip install --no-deps -e .

# 不要用 root 跑服務。/data 掛 volume，sqlite 檔才留得住。
RUN useradd --create-home --uid 1000 appuser \
    && mkdir -p /data \
    && chown -R appuser:appuser /app /data
USER appuser

EXPOSE 8000

# slim 映像沒有 curl，用 python 探活。
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["uvicorn", "{{name}}.api:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
