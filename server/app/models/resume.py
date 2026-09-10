"""简历表（E7：自写入起携带 user_id）。

M2 起：content 为原始 Markdown 文本，解析 + 脱敏后另存（迁移追加列），
切片向量写入 PGVector（M3，不在 Alembic 管理范围内）。
"""

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class Resume(Base, IdMixin, TimestampMixin):
    __tablename__ = "resumes"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
