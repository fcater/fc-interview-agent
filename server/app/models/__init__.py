"""业务表模型（全部导入以注册到 Base.metadata，Alembic 自动生成依赖）。"""

from app.models.base import Base
from app.models.evaluation_report import EvaluationReport
from app.models.interview_qa import InterviewQA
from app.models.interview_session import InterviewSession
from app.models.jd import JD
from app.models.preset_answer import PresetAnswer
from app.models.resume import Resume
from app.models.user import User

__all__ = [
    "Base",
    "EvaluationReport",
    "InterviewQA",
    "InterviewSession",
    "JD",
    "PresetAnswer",
    "Resume",
    "User",
]
