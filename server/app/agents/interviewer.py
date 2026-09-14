"""面试官图（tech-stack §2.4）：出题 → 等答（interrupt）→ 判答 → 追问/下一题/收尾。

节点为纯函数（E4）：只做 LLM 调用与状态变更，不碰业务数据库；
QA 落库由服务层监听图更新完成。RAG 检索通过 per-request 的
`config["configurable"]["rag_search"]` 注入（服务层按当前用户绑定闭包），
节点本身不知道 user_id 的存在——隔离职责收敛在服务层（E7）。

流式：节点内部 `ainvoke`/`astream`，token 流由服务层
`graph.astream(stream_mode=["messages", "updates"])` 统一捕获桥接 SSE（E9）。
"""

from collections.abc import Awaitable, Callable

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from loguru import logger

from app.config import settings
from app.knowledge.service import RetrievedChunk
from app.llm.factory import get_chat_model
from app.llm.prompts import render_prompt
from app.schemas.interview import QuestionEvaluation

from .state import InterviewState, QuestionType

# 检索注入：按题材取简历切片（服务层绑定当前用户后传入）
RagSearchFn = Callable[[str], Awaitable[list[RetrievedChunk]]]

_QUESTION_TYPE_LABELS: dict[str, str] = {
    "basic": "基础问题",
    "project": "项目经历",
    "deep_dive": "技术深挖",
}

_SYSTEM_PROMPT = render_prompt("interviewer_system.md")

# 出题类型轮换策略（E4 可替换注入点）：基础 → 项目 → 深挖 循环。
# 确定性轮换保证类型分布可控、可复现，避免 LLM 自选类型导致的漂移。
_TYPE_SEQUENCE: tuple[QuestionType, ...] = ("basic", "project", "deep_dive")


def question_type_sequence(question_index: int) -> QuestionType:
    """按题号确定性轮换出题类型（从 1 起编号）。"""
    return _TYPE_SEQUENCE[(question_index - 1) % len(_TYPE_SEQUENCE)]


def _get_rag_search(config: RunnableConfig) -> RagSearchFn | None:
    """从运行配置取用户绑定的检索闭包；缺省时出题退化为纯上下文模式。"""
    return ((config or {}).get("configurable") or {}).get("rag_search")


def _transcript(messages: list) -> str:
    """把对话历史渲染为总结用问答记录（跳过系统消息）。"""
    lines: list[str] = []
    for msg in messages:
        if isinstance(msg, HumanMessage):
            lines.append(f"候选人：{msg.content}")
        elif isinstance(msg, AIMessage):
            lines.append(f"面试官：{msg.content}")
    return "\n\n".join(lines)


async def generate_question(state: InterviewState, config: RunnableConfig) -> dict:
    """出题：类型轮换 → project/deep_dive 按 JD 技能点检索简历切片做题材。"""
    index = state["question_index"] + 1
    qtype = question_type_sequence(index)
    topic = ""
    if qtype != "basic" and state["jd_skills"]:
        topic = state["jd_skills"][(index - 1) % len(state["jd_skills"])]

    retrieved: list[RetrievedChunk] = []
    if topic and (rag_search := _get_rag_search(config)):
        retrieved = await rag_search(topic)
    retrieved_context = "\n".join(f"- {c.content}" for c in retrieved)

    question = await get_chat_model().ainvoke(
        [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(
                content=render_prompt(
                    "question_generate.md",
                    question_index=index,
                    max_questions=state["max_questions"],
                    question_type_label=_QUESTION_TYPE_LABELS[qtype],
                    topic=topic,
                    retrieved_context=retrieved_context,
                    asked_questions="\n".join(
                        f"- {q}" for q in state.get("asked_questions", [])
                    ),
                    resume_context=state["resume_context"],
                    jd_key_points=state["jd_key_points"],
                )
            ),
        ]
    )
    text = str(question.content).strip()
    logger.info(
        "面试官出题 index={} type={} topic={} 检索片段={}", index, qtype, topic, len(retrieved)
    )
    return {
        "phase": "questioning",
        "question_index": index,
        "question_type": qtype,
        "topic": topic,
        "current_question": text,
        # 判答相关字段随新题重置，避免上一题的结论泄入本题；
        # follow_up_round 归零保证追问轮次从新题重新计数（不残留上题值）
        "follow_up_round": 0,
        "last_answer": "",
        "assessment": "",
        "need_follow_up": False,
        "follow_up_point": "",
        # 直接复用 LLM 返回的消息对象：保留其 id，使 langgraph messages
        # 流式对 node output 的 dedupe 生效，避免与 LLM 流式 chunk 重复
        "messages": [question],
        "asked_questions": [text],
    }


async def wait_answer(state: InterviewState, config: RunnableConfig) -> dict:
    """等答：挂起图执行等用户输入；恢复值为回答文本或 {"action": "finish"}。"""
    resumed = interrupt(
        {
            "question": state["current_question"],
            "question_index": state["question_index"],
            "follow_up_round": state["follow_up_round"],
        }
    )
    if isinstance(resumed, dict) and resumed.get("action") == "finish":
        return {"abort_requested": True}
    answer = str(resumed)
    return {"last_answer": answer, "messages": [HumanMessage(content=answer)]}


async def evaluate_answer(state: InterviewState, config: RunnableConfig) -> dict:
    """判答：结构化输出简评与是否追问（E8）；失败降级为不追问（R4，面试不中断）。"""
    structured = (
        get_chat_model()
        .bind(temperature=settings.chat_extract_temperature)
        .with_structured_output(QuestionEvaluation)
    )
    prompt = render_prompt(
        "evaluate_answer.md",
        question=state["current_question"],
        question_type_label=_QUESTION_TYPE_LABELS.get(state["question_type"], "综合"),
        answer=state["last_answer"],
        resume_context=state["resume_context"],
    )
    try:
        result = await structured.ainvoke(
            [SystemMessage(content=_SYSTEM_PROMPT), HumanMessage(content=prompt)]
        )
        assessment = result.assessment.strip()
        need_follow_up = result.need_follow_up
        follow_up_point = result.follow_up_point.strip()
    except Exception:
        # 结构化失败重试由模型层承担（openai 兼容端点）；仍失败则降级，不阻塞面试
        logger.exception("判答结构化输出失败，降级为不追问 index={}", state["question_index"])
        assessment = "（本次评估生成失败，已跳过）"
        need_follow_up = False
        follow_up_point = ""
    logger.info(
        "判答完成 index={} follow_up_round={} need_follow_up={}",
        state["question_index"],
        state["follow_up_round"],
        need_follow_up,
    )
    return {
        "assessment": assessment,
        "need_follow_up": need_follow_up,
        "follow_up_point": follow_up_point,
        "messages": [AIMessage(content=assessment)],
    }


async def follow_up(state: InterviewState, config: RunnableConfig) -> dict:
    """追问：围绕判答给出的切入点生成下一问（同一题的 follow_up_round+1）。"""
    question = await get_chat_model().ainvoke(
        [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(
                content=render_prompt(
                    "follow_up.md",
                    question=state["current_question"],
                    answer=state["last_answer"],
                    assessment=state["assessment"],
                    follow_up_point=state["follow_up_point"],
                    resume_context=state["resume_context"],
                )
            ),
        ]
    )
    text = str(question.content).strip()
    return {
        "current_question": text,
        "follow_up_round": state["follow_up_round"] + 1,
        "messages": [AIMessage(content=text)],
    }


async def summarize(state: InterviewState, config: RunnableConfig) -> dict:
    """收尾总结（M4 不评分，评分报告属 M5 rubric）。"""
    summary = await get_chat_model().ainvoke(
        [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(
                content=render_prompt(
                    "summarize.md",
                    aborted=state["abort_requested"],
                    transcript=_transcript(state["messages"]),
                    jd_key_points=state["jd_key_points"],
                )
            ),
        ]
    )
    text = str(summary.content).strip()
    return {
        "phase": "finished",
        "summary": text,
        # 复用原始消息对象保留 id，messages 流式 dedupe 生效（与 generate_question 同理）
        "messages": [summary],
    }


def _route_after_wait(state: InterviewState) -> str:
    return "summarize" if state["abort_requested"] else "evaluate_answer"


def _route_after_evaluate(state: InterviewState) -> str:
    if state["need_follow_up"] and state["follow_up_round"] < state["max_follow_ups"]:
        return "follow_up"
    if state["question_index"] >= state["max_questions"]:
        return "summarize"
    return "generate_question"


def build_interviewer_graph(checkpointer):
    """编译面试官图：checkpointer 由调用方管理生命周期（thread_id = 会话 id）。"""
    graph = StateGraph(InterviewState)
    graph.add_node("generate_question", generate_question)
    graph.add_node("wait_answer", wait_answer)
    graph.add_node("evaluate_answer", evaluate_answer)
    graph.add_node("follow_up", follow_up)
    graph.add_node("summarize", summarize)
    graph.add_edge(START, "generate_question")
    graph.add_edge("generate_question", "wait_answer")
    graph.add_conditional_edges(
        "wait_answer",
        _route_after_wait,
        {"evaluate_answer": "evaluate_answer", "summarize": "summarize"},
    )
    graph.add_conditional_edges(
        "evaluate_answer",
        _route_after_evaluate,
        {
            "follow_up": "follow_up",
            "generate_question": "generate_question",
            "summarize": "summarize",
        },
    )
    graph.add_edge("follow_up", "wait_answer")
    graph.add_edge("summarize", END)
    return graph.compile(checkpointer=checkpointer)
