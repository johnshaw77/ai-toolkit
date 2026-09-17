"""使用者相關的 schema。"""

from __future__ import annotations

import uuid

from pydantic import EmailStr

from app.models.user import UserRole
from app.schemas.common import ORMModel


class UserRead(ORMModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
