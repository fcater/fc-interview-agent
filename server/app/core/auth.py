"""认证依赖：从 Authorization: Bearer 解析当前用户注入路由（E7 隔离兜底）。

所有受保护路由通过 `Depends(get_current_user)` 拿到 User，服务层一律从
该对象取 user_id，杜绝跨用户查询（tech-stack §2.9：隔离而非鉴权）。
"""

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.exceptions import UnauthorizedError
from app.core.security import decode_access_token
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False, description="登录接口签发的 JWT")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """校验 Bearer Token → 加载用户；未携带 / 伪造 / 过期一律 401。"""
    if credentials is None:
        raise UnauthorizedError("未携带认证凭据，请先登录")
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("登录已过期，请重新登录") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("无效的认证凭据") from exc

    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError, TypeError) as exc:
        raise UnauthorizedError("无效的认证凭据") from exc

    user = await db.get(User, user_id)
    if user is None:
        raise UnauthorizedError("用户不存在或已注销")
    # 令牌版本校验（单会话）：重新登录后旧 token 的 ver 落后于库内值，立即失效
    if payload.get("ver") != user.token_version:
        raise UnauthorizedError("登录已失效，请重新登录")
    return user
