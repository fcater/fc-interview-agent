"""面试评估报告表（M5 写入）。

report 为 InterviewReport 的全量 JSON（综合分 + 维度列表 + 问题总结 +
改进建议）；维度名与标准由 rubric 模板驱动（E5），schema 结构固定（E8）。
overall_score 单列冗余，供列表页排序/展示，免解析 JSON。
"""

from typing import Any

from sqlalchemy import ForeignKey, Integer
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
    overall_score: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    report: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
