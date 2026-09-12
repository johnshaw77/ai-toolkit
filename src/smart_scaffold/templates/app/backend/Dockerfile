# 後端正式映像。開發時不需要它——`make api` 直接在本機跑比較快。
FROM python:{{python_version}}-slim

# uv 從官方映像複製進來，不要在容器裡用 pip 裝 uv。
COPY --from=ghcr.io/astral-sh/uv:0.5.14 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

# 虛擬環境放在 /opt，不要放 /app——/app 會被 bind mount 蓋掉。
RUN uv venv /opt/venv

WORKDIR /app

# 先只複製依賴宣告，這樣改程式碼時不會讓依賴那層的快取失效。
COPY pyproject.toml ./
RUN uv pip install -r pyproject.toml

COPY . .

# 不要用 root 跑服務。/data 給 sqlite 用，掛 volume 之後資料才留得住。
RUN useradd --create-home --uid 1000 appuser \
    && mkdir -p /data \
    && chown -R appuser:appuser /app /data
USER appuser

EXPOSE 8000

# slim 映像沒有 curl，用 python 探活。
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health')"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
