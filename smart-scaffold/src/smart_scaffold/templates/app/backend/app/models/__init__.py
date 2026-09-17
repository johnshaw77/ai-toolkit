"""所有 model 在這裡集中匯入，alembic autogenerate 才看得到全部資料表。"""

from app.models.auth import RefreshToken
# scaffold:if demo
from app.models.item import Item, ItemStatus
# scaffold:endif
from app.models.user import User, UserRole

__all__ = [
    # scaffold:if demo
    "Item",
    "ItemStatus",
    # scaffold:endif
    "RefreshToken",
    "User",
    "UserRole",
]
