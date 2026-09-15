"""求职者模式 DTO 与 LLM 结构化输出 schema（M6，E8）。

AnswerCritique 是点评节点的结构化输出模型；SSE 事件复用
schemas/interview.py 的 Token/Done/Error（{type, ...} 约定），
阶段事件因语义不同单独定义（answered / critiqued）。
"""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.interview import InterviewQABrief, InterviewSessionBrief

# ── LLM 结构化输出（点评节点，E8）─────────────────────────────────


class AnswerCritique(BaseModel):
    """对 AI 最近一次回答的点评（面向求职者练习改进）。"""

    strengths: list[str] = Field(description="回答中的优点，1-3 条，每条一句中文")
    weaknesses: list[str] = Field(description="回答中的不足，1-3 条，每条一句中文")
    suggestions: list[str] = Field(description="改进建议，1-3 条，每条一句中文且可操作")


# ── 会话 DTO ─────────────────────────────────────────────────────


class CandidateStartRequest(BaseModel):
    """开始求职者模式练习：选择简历（AI 以该简历身份应答，须属于当前用户）。"""

    resume_id: int


class CandidateQuestionRequest(BaseModel):
    """用户（扮演面试官）提问，AI 流式作答。"""

    content: str = Field(min_length=1, max_length=20_000)

    @field_validator("content")
    @classmethod
    def _content_not_blank(cls, v: str) -> str:
        # strip 后为空视为无效（min_length 不拦纯空白，空白提问会走空检索/空作答）
        if not v.strip():
            raise ValueError("提问内容不能为空白")
        return v.strip()


class CandidateSnapshotResponse(BaseModel):
    """求职者会话快照：刷新/重连后重建视图的唯一数据源。

    needs_stream=True 表示新会话尚未初始化 checkpoint（无问答历史），
    前端应打开流式端点完成图初始化；已有历史时直接从 qa_history 重建。
    """

    session: InterviewSessionBrief
    phase: str  # opening / questioning / finished
    question_count: int = 0
    needs_stream: bool = False
    qa_history: list[InterviewQABrief] = Field(default_factory=list)


# ── SSE 事件（服务层产出，前端按 type 分支）──────────────────────


class CandidatePhaseEvent(BaseModel):
    """求职者阶段事件：AI 作答完成（answered）或点评完成（critiqued）。

    answered 携带规范化的完整回答与是否命中预设（前端替换流式缓冲）；
    critiqued 携带结构化点评（优点/不足/建议）。
    """

    type: Literal["phase"] = "phase"
    phase: str  # answered / critiqued
    question_index: int
    question: str | None = None
    answer: str | None = None
    used_preset: bool | None = None
    critique: AnswerCritique | None = None
