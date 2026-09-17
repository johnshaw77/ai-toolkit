"""FastAPI 應用程式：網頁與 JSON API 都在這裡。

分工很清楚，不要破壞它：

* **這一層只做轉換**——把 HTTP 轉成 service 呼叫、把回傳值轉成 JSON 或頁面、
  把例外轉成對的狀態碼。業務邏輯一律寫在 ``items`` / ``users``。
* ``/api/`` 底下回 JSON，其他路徑回 HTML。同一個「沒登入」錯誤，在 API 是 401，
  在頁面是 302 導向登入頁——直接把 401 甩給瀏覽器只會得到一片白。
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Form, Query, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# scaffold:if demo
from . import items as items_service
# scaffold:endif
from . import users
from .auth import SESSION_COOKIE, authenticate, read_session, sign_session
from .config import app_title, load_env, load_settings, resolve_session_max_age
from .db import connect, init_db
from .errors import AppError, NotAuthenticated

PACKAGE_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(PACKAGE_DIR / "templates"))


def get_db() -> Iterator[sqlite3.Connection]:
    """每個請求一條連線。

    sqlite3 的連線不能跨執行緒共用，而 FastAPI 的同步端點跑在 threadpool 上，
    所以不要圖方便開一條全域連線。
    """
    connection = connect()
    try:
        yield connection
    finally:
        connection.close()


DbDep = Annotated[sqlite3.Connection, Depends(get_db)]


def current_user(request: Request, connection: DbDep) -> sqlite3.Row:
    user_id = read_session(request.cookies.get(SESSION_COOKIE))
    row = users.get(connection, user_id) if user_id is not None else None
    if row is None or not row["is_active"]:
        raise NotAuthenticated("請先登入")
    return row


UserDep = Annotated[sqlite3.Row, Depends(current_user)]


def _wants_json(request: Request) -> bool:
    return request.url.path.startswith("/api/")


def register_handlers(app: FastAPI) -> None:
    """一行掛上全部例外處理。"""

    @app.exception_handler(AppError)
    def _app_error(request: Request, exc: AppError) -> Response:
        if isinstance(exc, NotAuthenticated) and not _wants_json(request):
            target = request.url.path
            return RedirectResponse(f"/login?next={target}", status_code=status.HTTP_302_FOUND)
        return JSONResponse(status_code=exc.status_code, content=exc.body())


def create_app() -> FastAPI:
    load_env()
    settings = load_settings()

    app = FastAPI(title=app_title(settings), version="0.1.0", docs_url="/api/docs")
    app.mount("/static", StaticFiles(directory=str(PACKAGE_DIR / "static")), name="static")
    register_handlers(app)

    # 資料表可以重複建立，所以每次啟動都確保一次，少一個「忘了 init」的坑。
    connection = connect()
    try:
        init_db(connection)
    finally:
        connection.close()

    _register_pages(app, settings)
    _register_api(app)
    return app


# --------------------------------------------------------------------------- 頁面


def _register_pages(app: FastAPI, settings: dict[str, Any]) -> None:
    title = app_title(settings)

    @app.get("/")
    def home(request: Request, user: UserDep) -> Response:
        return templates.TemplateResponse(
            request,
            "home.html",
            {"app_title": title, "app_name": settings.get("app", {}).get("name", ""),
             "user": dict(user), "active": "home"},
        )

    @app.get("/login")
    def login_page(
        request: Request,
        next: Annotated[str, Query(description="登入後要回到哪一頁")] = "/",
    ) -> Response:
        if read_session(request.cookies.get(SESSION_COOKIE)) is not None:
            return RedirectResponse(next, status_code=status.HTTP_302_FOUND)
        return templates.TemplateResponse(
            request, "login.html", {"app_title": title, "next": next, "error": None}
        )

    @app.post("/login")
    def login_submit(
        request: Request,
        connection: DbDep,
        email: Annotated[str, Form()],
        password: Annotated[str, Form()],
        next: Annotated[str, Form()] = "/",
    ) -> Response:
        user = authenticate(connection, email, password)
        if user is None:
            # 帳號不存在與密碼錯誤講同一句話，不要洩漏哪些 email 有註冊。
            return templates.TemplateResponse(
                request,
                "login.html",
                {"app_title": title, "next": next, "error": "帳號或密碼不正確"},
                status_code=status.HTTP_401_UNAUTHORIZED,
            )
        response = RedirectResponse(next or "/", status_code=status.HTTP_302_FOUND)
        response.set_cookie(
            SESSION_COOKIE,
            sign_session(int(user["id"])),
            max_age=resolve_session_max_age(),
            httponly=True,
            samesite="lax",
        )
        return response

    @app.post("/logout")
    def logout() -> Response:
        response = RedirectResponse("/login", status_code=status.HTTP_302_FOUND)
        response.delete_cookie(SESSION_COOKIE)
        return response

    # scaffold:if demo
    @app.get("/items")
    def items_page(request: Request, user: UserDep) -> Response:
        return templates.TemplateResponse(
            request,
            "items.html",
            {
                "app_title": title,
                "user": dict(user),
                "statuses": items_service.STATUS_LABELS,
                "active": "items",
            },
        )

    # scaffold:endif


# --------------------------------------------------------------------------- API


def _register_api(app: FastAPI) -> None:
    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    # scaffold:if demo
    @app.get("/api/items")
    def list_items(
        connection: DbDep,
        _user: UserDep,
        keyword: str | None = Query(None, description="比對代號或名稱"),
        status_filter: str | None = Query(None, alias="status"),
        page: int = Query(1, ge=1),
        page_size: int = Query(20, ge=1, le=items_service.MAX_PAGE_SIZE),
        sort: str | None = Query(None, description="欄位名，前面加 - 代表遞減"),
    ) -> dict[str, Any]:
        return items_service.search(
            connection,
            keyword=keyword,
            status=status_filter,
            page=page,
            page_size=page_size,
            sort=sort,
        )

    @app.post("/api/items", status_code=status.HTTP_201_CREATED)
    def create_item(
        payload: dict[str, Any], connection: DbDep, _user: UserDep
    ) -> dict[str, Any]:
        return items_service.create(connection, payload)

    @app.get("/api/items/{item_id}")
    def get_item(item_id: int, connection: DbDep, _user: UserDep) -> dict[str, Any]:
        return items_service.get(connection, item_id)

    @app.patch("/api/items/{item_id}")
    def update_item(
        item_id: int, payload: dict[str, Any], connection: DbDep, _user: UserDep
    ) -> dict[str, Any]:
        return items_service.update(connection, item_id, payload)

    @app.delete("/api/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_item(item_id: int, connection: DbDep, _user: UserDep) -> Response:
        items_service.delete(connection, item_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # scaffold:endif
