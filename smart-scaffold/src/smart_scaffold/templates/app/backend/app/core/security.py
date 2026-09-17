"""JWT 與 refresh token。

access token 短命（分鐘級），refresh token 長命但**只存雜湊**，而且會輪替：
每次換票就作廢舊的。偵測到已作廢的 refresh token 被重用時，整條鏈一起作廢
——那代表票被偷了。
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta

import jwt

from .clock import utcnow
from .config import settings
from .errors import UnauthorizedError

ACCESS_TOKEN_TYPE = "access"


def now() -> datetime:
    """一律用帶時區的 UTC，資料庫與 JWT 才不會對不起來。"""
    return utcnow()


def create_access_token(user_id: str, role: str) -> tuple[str, int]:
    """回傳 ``(token, 有效秒數)``。"""
    expires_in = settings.access_token_expire_minutes * 60
    issued_at = now()
    payload = {
        "sub": user_id,
        "role": role,
        "type": ACCESS_TOKEN_TYPE,
        "iat": issued_at,
        "exp": issued_at + timedelta(seconds=expires_in),
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)
    return token, expires_in


def decode_access_token(token: str) -> dict[str, str]:
    """解開 access token；壞掉、過期、型別不對都算未授權。"""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        raise UnauthorizedError("憑證無效或已過期") from None
    if payload.get("type") != ACCESS_TOKEN_TYPE:
        raise UnauthorizedError("憑證類型不正確")
    return payload


def generate_refresh_token() -> tuple[str, str]:
    """回傳 ``(給使用者的原始值, 存進資料庫的雜湊)``。資料庫裡永遠不存原始值。"""
    raw = secrets.token_urlsafe(48)
    return raw, hash_refresh_token(raw)


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def refresh_token_expiry() -> datetime:
    return now() + timedelta(days=settings.refresh_token_expire_days)
