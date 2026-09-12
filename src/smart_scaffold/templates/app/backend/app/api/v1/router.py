"""v1 的總路由。新增模組時在這裡掛一行。"""

from fastapi import APIRouter

from app.api.v1.endpoints import auth, health, items, users

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(items.router, prefix="/items", tags=["items"])
