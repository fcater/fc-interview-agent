"""口令哈希（bcrypt）与 JWT 签发/校验（pyjwt）。

凭据与密钥全部来自配置（环境变量注入），此处不出现任何默认值。
"""

import datetime as dt

import bcrypt
import jwt

from app.config import settings

# bcrypt 仅处理前 72 字节；注册 schema 已限制口令长度上限。
_BCRYPT_ROUNDS = 12


def hash_password(plain: str) -> str:
    """bcrypt 哈希（自动加盐）。"""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)).decode(
        "utf-8"
    )


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: int, username: str, token_version: int) -> str:
    """签发 JWT：sub = user_id，附带 username（日志排查）与 ver（令牌版本）。

    ver 与用户表 token_version 对应（单会话模型）：每次登录 +1，
    旧 token 的 ver 落后于库内值即失效，见 core/auth.py。
    """
    now = dt.datetime.now(dt.UTC)
    payload = {
        "sub": str(user_id),
        "username": username,
        "ver": token_version,
        "iat": now,
        "exp": now + dt.timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """校验并解析 JWT；失败（过期 / 伪造 / 算法不符）抛 jwt.PyJWTError 子类。"""
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
