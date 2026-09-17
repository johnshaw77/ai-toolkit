"""v1 的總路由。新增模組時在這裡掛一行。"""

from fastapi import APIRouter

# 拆成多行是為了讓 items 那一行可以單獨被條件控制。
# 結尾的逗號（magic trailing comma）會讓 ruff 保持這個展開的樣子，不要拿掉。
from app.api.v1.endpoints import (
    auth,
    health,
    # scaffold:if demo
    items,
    # scaffold:endif
    users,
)

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
# scaffold:if demo
api_router.include_router(items.router, prefix="/items", tags=["items"])
# scaffold:endif
