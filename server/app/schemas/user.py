"""用户相关 DTO：注册 / 登录 / 当前用户。"""

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field

# 用户名：2–32 位，字母 / 数字 / 下划线 / 中文
USERNAME_PATTERN = r"^[\w一-龥]{2,32}$"
# 口令：8–72 位（bcrypt 仅处理前 72 字节）
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 72


class RegisterRequest(BaseModel):
    username: str = Field(pattern=USERNAME_PATTERN, description="2–32 位字母/数字/下划线/中文")
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    created_at: dt.datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
