"""面试相关 DTO 与 LLM 结构化输出 schema（E8）。

QuestionEvaluation 是判答节点的结构化输出模型（with_structured_output）；
SSE 事件模型统一为 {type, ...}，前端按 type 分支渲染。
"""

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field

# ── LLM 结构化输出（判答节点，E8）─────────────────────────────────


class QuestionEvaluation(BaseModel):
    """判答结果：简短评估 + 是否追问 + 追问切入点。

    评估面向用户展示（1–2 句中文），追问点供 follow_up 节点出题使用。
    """

    assessment: str = Field(description="对回答的简短评估，1–2 句中文，先肯定再指出缺口")
    need_follow_up: bool = Field(
        description="回答是否浅尝辄止/有明显缺口，值得深入追问；已充分或跑题则 False"
    )
    follow_up_point: str = Field(
        default="", description="追问切入点（针对回答中未展开的具体细节）；不追问时为空串"
    )


# ── 会话 DTO ─────────────────────────────────────────────────────


class InterviewStartRequest(BaseModel):
    """开始面试：选择简历与 JD（均须属于当前用户，否则 404）。"""

    resume_id: int
    jd_id: int | None = None


class InterviewQABrief(BaseModel):
    """单条问答明细（含追问轮次，回看与快照共用）。"""

    model_config = {"from_attributes": True}

    question_index: int
    question_type: str | None = None
    question: str
    answer: str | None = None
    follow_up_round: int = 0
    assessment: str | None = None


class InterviewSessionBrief(BaseModel):
    """面试会话简要信息（列表/快照内嵌）。"""

    model_config = {"from_attributes": True}

    id: int
    resume_id: int | None
    jd_id: int | None
    role: str
    status: str
    question_count: int
    created_at: dt.datetime


class InterviewSnapshotResponse(BaseModel):
    """面试会话快照：前端刷新/重连后重建视图的唯一数据源。

    needs_stream=True 表示当前问题尚未生成（新会话或中断在生成中），
    前端应立即打开流式端点获取首题；否则直接展示 current_question 并可作答。
    """

    session: InterviewSessionBrief
    phase: str  # 图内阶段（opening / questioning / finished）
    question_index: int = 0
    follow_up_round: int = 0
    max_questions: int
    current_question: str | None = None
    question_type: str | None = None
    summary: str | None = None
    needs_stream: bool = False
    qa_history: list[InterviewQABrief] = Field(default_factory=list)


class InterviewAnswerRequest(BaseModel):
    """提交当前问题的回答（提交后进入判答，走 SSE 流式返回评估与下一问题）。"""

    content: str = Field(min_length=1, max_length=20_000)


# ── SSE 事件模型（服务层产出，前端按 type 分支）──────────────────


class TokenEvent(BaseModel):
    """流式文本块。content 为增量文本，node 标明来源节点（前端按归属渲染气泡）。"""

    type: Literal["token"] = "token"
    content: str
    node: str | None = None


class PhaseEvent(BaseModel):
    """阶段事件：出题/追问完成（awaiting_answer）或判答完成（assessed）时下发。

    awaiting_answer 携带完整问题文本（前端用它替换流式缓冲的规范文本）；
    assessed 携带判答简评与是否追问。
    """

    type: Literal["phase"] = "phase"
    phase: Literal["awaiting_answer", "assessed"]
    question_index: int
    follow_up_round: int
    question: str | None = None
    question_type: str | None = None
    assessment: str | None = None
    need_follow_up: bool | None = None


class DoneEvent(BaseModel):
    """本轮流结束：会话收尾（completed/aborted）或到达下一次人工输入。"""

    type: Literal["done"] = "done"
    status: str  # in_progress（等待作答）/ completed / aborted
    question_count: int = 0
    summary: str | None = None


class ErrorEvent(BaseModel):
    """流内错误（LLM 失败等）：前端提示后可重试或恢复快照。"""

    type: Literal["error"] = "error"
    message: str
