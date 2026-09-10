"""认证路由：注册 / 登录。

- 注册：bcrypt 口令哈希入库，用户名唯一（含并发竞争兜底）。
- 登录：校验通过签发 JWT；用户不存在时也执行一次哈希校验，
  避免按响应时差枚举用户名。
"""

from fastapi import APIRouter, Depends
from loguru import logger
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.exceptions import ConflictError, InvalidCredentialsError
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User
from app.schemas.user import LoginRequest, RegisterRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])

# 用户不存在时参与比较的固定哈希，抹平「存在/不存在」的时差
_DUMMY_HASH = hash_password("dummy-password-for-timing")


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> User:
    exists = await db.scalar(select(User.id).where(User.username == payload.username))
    if exists is not None:
        raise ConflictError("用户名已被注册")

    user = User(username=payload.username, password_hash=hash_password(payload.password))
    db.add(user)
    try:
        await db.commit()
    except IntegrityError as exc:  # 并发注册同名兜底（唯一索引）
        await db.rollback()
        raise ConflictError("用户名已被注册") from exc
    await db.refresh(user)
    logger.info("用户注册成功 id={} username={}", user.id, user.username)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user = await db.scalar(select(User).where(User.username == payload.username))
    password_ok = verify_password(payload.password, user.password_hash) if user else False
    if user is None:
        verify_password(payload.password, _DUMMY_HASH)  # 抹平时差
    if user is None or not password_ok:
        raise InvalidCredentialsError("用户名或密码错误")

    # 令牌版本原子 +1（单会话）：本次登录作废该账号之前签发的所有 token
    result = await db.execute(
        update(User)
        .where(User.id == user.id)
        .values(token_version=User.token_version + 1)
        .returning(User.token_version)
    )
    new_version = result.scalar_one()
    await db.commit()

    token = create_access_token(user.id, user.username, new_version)
    logger.info("用户登录成功 id={} username={} ver={}", user.id, user.username, new_version)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))
