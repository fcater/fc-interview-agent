"""面试评估报告表（M5 写入）。

scores 为结构化评分（综合 / 技术能力 / 项目理解 / 表达能力 / 岗位匹配度），
结构由 M5 的 Pydantic schema 固定；summary / suggestions 为文本总结。
"""

from sqlalchemy import ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class EvaluationReport(Base, IdMixin, TimestampMixin):
    __tablename__ = "evaluation_reports"

    session_id: Mapped[int] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    scores: Mapped[dict] = mapped_column(JSONB, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    suggestions: Mapped[str] = mapped_column(Text, nullable=False)
