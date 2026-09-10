"""JD（岗位描述）表。

key_points 为 M2 结构化提取结果（技术栈 / 要求 / 加分项等），JSONB 存储，
结构由 M2 的 Pydantic schema 定义。
"""

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class JD(Base, IdMixin, TimestampMixin):
    __tablename__ = "jds"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    key_points: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
