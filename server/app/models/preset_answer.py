"""预设标准答案表（M6，E6/E7）。

求职者模式的「标准答案库」：用户预先录入 题目 + 参考答案 + 标签，
向量化时只嵌入 question（与用户提问匹配），answer/tags 随 metadata
写入向量库供检索命中后取用；vector_ids 为向量 id（删除时同步清理
PGVector，与 Resume.vector_ids 同范式）。
"""

from sqlalchemy import ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class PresetAnswer(Base, IdMixin, TimestampMixin):
    __tablename__ = "preset_answers"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    # 标签列表（E6 标签体系）：命中判定「任一标签为提问文本子串」
    tags: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default="[]")
    vector_ids: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
