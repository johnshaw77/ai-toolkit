"""統一的錯誤格式。

**路由裡不要丟 ``HTTPException``**，丟這裡的 ``AppError`` 子類，
JSON 回應才會是一致的 ``{"code": ..., "message": ...}``。

同一個錯誤在 API 與網頁上的表現不一樣：``/api/`` 底下回 JSON，其他路徑
（也就是人在看的頁面）未登入時是 302 導向登入頁，而不是甩一個 401 給瀏覽器。
"""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    """所有可預期錯誤的基底。"""

    status_code = 500
    code = "INTERNAL_ERROR"

    def __init__(self, message: str, detail: Any = None) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail

    def body(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.detail is not None:
            payload["detail"] = self.detail
        return payload


class ValidationError(AppError):
    status_code = 400
    code = "VALIDATION_ERROR"


class NotAuthenticated(AppError):
    """沒登入。網頁會被導向登入頁，API 會拿到 401。"""

    status_code = 401
    code = "UNAUTHORIZED"


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"
