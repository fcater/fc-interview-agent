"""用户路由：当前用户信息（受保护接口，验证 Token 链路）。"""

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user
from app.models import User
from app.schemas.user import UserResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)) -> User:
    return user
