"""用户表。

token_version：令牌版本（单会话模型）——每次登录 +1 并写入 JWT 的 ver claim，
校验时与库内当前值比对，不一致即 401，从而让旧 token 在重新登录后立即失效。
"""

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class User(Base, IdMixin, TimestampMixin):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
