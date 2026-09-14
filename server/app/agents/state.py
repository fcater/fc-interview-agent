"""面试官图状态定义（tech-stack §2.4 InterviewState）。

节点是纯函数：只读写本状态与调用 LLM，不碰业务数据库；
QA 落库与会话状态更新由服务层监听图事件完成（关注点分离，
也让求职者图 M6 可独立复用状态基类而不共享面试官的持久化）。

messages 走 add_messages reducer 追加对话历史（随 checkpoint 持久化）；
其余字段节点返回即整值覆盖。
"""

import operator
from typing import Annotated, Literal

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

# 出题类型（interview_qa.question_type 同源）
QuestionType = Literal["basic", "project", "deep_dive"]

# 会话阶段：opening=首题生成前 / questioning=问答进行中 / finished=已收尾
Phase = Literal["opening", "questioning", "finished"]


class InterviewState(TypedDict):
    """面试官图状态。字段语义见 tech-stack §2.4。"""

    # 全量对话历史（面试官问题 / 用户回答 / 简评），checkpoint 持久化
    messages: Annotated[list[AnyMessage], add_messages]
    phase: Phase

    # 进度：question_index 从 1 起编号（与 interview_qa 对齐），上限读配置
    question_index: int
    max_questions: int
    follow_up_round: int  # 当前题已追问轮数，0=主问题
    max_follow_ups: int

    # 当前题：文本 / 类型 / 题材（JD 技能点，basic 题为空）
    current_question: str
    question_type: QuestionType
    topic: str

    # 最近一轮判答结果（evaluate_answer 写入，服务层落库 assessment）
    last_answer: str
    assessment: str
    need_follow_up: bool
    follow_up_point: str

    # 会话级固定上下文（start 时构造，全程不变）
    resume_context: str  # 脱敏简历全文
    jd_key_points: str  # JD 结构化要点（格式化文本；无 JD 时空串）
    jd_skills: list[str]  # JD 必备技能列表（project/deep_dive 题材轮换来源）
    asked_questions: Annotated[list[str], operator.add]  # 已出问题（防重复出题）

    # 用户主动结束标记（wait_answer 的 resume 值为 {"action": "finish"} 时置位）
    abort_requested: bool
    summary: str  # 收尾总结文本（summarize 写入，随 done 事件下发）
