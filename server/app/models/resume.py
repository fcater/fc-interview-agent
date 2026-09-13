"""简历表（E7：自写入起携带 user_id）。

content 为解析 + 脱敏后的 Markdown；vector_ids 为 M3 切片向量 id
（删除简历时据此同步清理 PGVector，向量表由 PGVector 自动建、不走 Alembic）。
"""

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class Resume(Base, IdMixin, TimestampMixin):
    __tablename__ = "resumes"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    vector_ids: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
