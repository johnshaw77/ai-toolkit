"""登入與 session。

伺服器端渲染的專案用 **cookie session** 最自然：登入後發一個簽過章的
HttpOnly cookie，之後每個請求都自己帶上，前端不需要管 token。

安全上的三個選擇，都刻意寫在這裡：

* cookie 是 ``HttpOnly``，JavaScript 讀不到，XSS 偷不走。
* ``SameSite=Lax``，其他網站發過來的 POST 不會帶上這個 cookie，
  這是不另外做 CSRF token 的前提。要放寬成 ``None`` 的話就得補 CSRF 防護。
* 密碼用 argon2 雜湊，不是 sha256 之類的東西。
"""

from __future__ import annotations

import sqlite3
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from .config import resolve_secret_key, resolve_session_max_age

SESSION_COOKIE = "{{name}}_session"
_SALT = "{{name}}.session.v1"

_hasher = PasswordHasher()

#: 帳號不存在時也跑一次驗證，讓「帳號錯」與「密碼錯」花一樣久，
#: 否則攻擊者可以用回應時間問出哪些 email 有註冊。
_DUMMY_HASH = _hasher.hash("dummy-password-for-timing-equalisation")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, hashed: str | None) -> bool:
    """帳號不存在時傳 ``None``，一樣會跑一次驗證再回 False。"""
    target = hashed if hashed is not None else _DUMMY_HASH
    try:
        _hasher.verify(target, password)
    except (VerifyMismatchError, VerificationError):
        return False
    return hashed is not None


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(resolve_secret_key(), salt=_SALT)


def sign_session(user_id: int) -> str:
    return _serializer().dumps({"uid": int(user_id)})


def read_session(token: str | None) -> int | None:
    """解開 cookie 拿使用者 id；壞掉或過期一律回 ``None``。"""
    if not token:
        return None
    try:
        data: Any = _serializer().loads(token, max_age=resolve_session_max_age())
    except (BadSignature, SignatureExpired):
        return None
    if isinstance(data, dict) and isinstance(data.get("uid"), int):
        return data["uid"]
    return None


def authenticate(connection: sqlite3.Connection, email: str, password: str) -> sqlite3.Row | None:
    """帳密對就回使用者，否則回 ``None``。"""
    row = connection.execute(
        "SELECT * FROM users WHERE email = ?", (email.strip().lower(),)
    ).fetchone()
    hashed = row["hashed_password"] if row is not None else None
    if not verify_password(password, hashed):
        return None
    if row is not None and not row["is_active"]:
        return None
    return row
