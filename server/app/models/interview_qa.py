"""面试问答明细表。

question_index 从 1 起编号；follow_up_round = 0 为主问题，> 0 为追问轮次。
question_type：basic / project / deep_dive（M4 出题类型分布）。
"""

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class InterviewQA(Base, IdMixin, TimestampMixin):
    __tablename__ = "interview_qa"
    __table_args__ = (
        UniqueConstraint("session_id", "question_index", "follow_up_round"),
    )

    session_id: Mapped[int] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    question_index: Mapped[int] = mapped_column(Integer, nullable=False)
    question_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 判答简评（M4 结构化输出落库；M5 回看/评分依据），主问题未答时为空
    assessment: Mapped[str | None] = mapped_column(Text, nullable=True)
    follow_up_round: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
