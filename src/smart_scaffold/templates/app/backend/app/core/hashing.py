"""密碼雜湊。用 argon2，不要換成 md5/sha 之類的東西。"""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError

_hasher = PasswordHasher()

#: 帳號不存在時也跑一次驗證，讓「帳號錯」與「密碼錯」花一樣久，
#: 否則攻擊者可以用回應時間問出哪些 email 存在。
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
