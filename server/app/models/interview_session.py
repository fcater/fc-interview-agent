"""面试会话表。

role：interviewer（AI 面试官，M4）/ candidate（AI 求职者，M6）。
status：in_progress / completed / aborted。
LangGraph 检查点以本表 id 作为 thread_id（SqliteSaver），会话恢复对齐。
"""

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin

ROLE_INTERVIEWER = "interviewer"
ROLE_CANDIDATE = "candidate"
STATUS_IN_PROGRESS = "in_progress"
STATUS_COMPLETED = "completed"
STATUS_ABORTED = "aborted"


class InterviewSession(Base, IdMixin, TimestampMixin):
    __tablename__ = "interview_sessions"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    resume_id: Mapped[int | None] = mapped_column(
        ForeignKey("resumes.id", ondelete="SET NULL"), nullable=True
    )
    jd_id: Mapped[int | None] = mapped_column(
        ForeignKey("jds.id", ondelete="SET NULL"), nullable=True
    )
    role: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=ROLE_INTERVIEWER
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=STATUS_IN_PROGRESS
    )
    question_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
