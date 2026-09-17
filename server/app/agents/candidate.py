"""求职者图（M6，tech-stack §2.4）：等问（interrupt）→ 检索 → 作答 → 追问循环。

与面试官图（interviewer.py）独立编译、互不掺逻辑：用户扮演面试官提问，
AI 以简历主人口吻作答。检索经 per-request 的 config 注入双闭包
（rag_search 简历切片 / preset_search 预设答案），节点不知道 user_id
的存在（E7 隔离收敛在服务层）；点评走结构化输出（E8）；finish 不调 LLM。

流式：token 流由服务层 graph.astream(stream_mode=["messages", "updates"])
统一捕获桥接 SSE（E9），与本仓库面试官图同一范式。
"""

from collections.abc import Awaitable, Callable

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from loguru import logger

from app.config import settings
from app.knowledge.service import PresetHit, RetrievedChunk
from app.llm.factory import get_chat_model, get_extract_model
from app.llm.prompts import render_prompt
from app.schemas.candidate import AnswerCritique

from .state import CandidateState

# 检索注入（服务层按当前用户绑定后传入）
RagSearchFn = Callable[[str], Awaitable[list[RetrievedChunk]]]
PresetSearchFn = Callable[[str], Awaitable[PresetHit | None]]

_SYSTEM_PROMPT = render_prompt("candidate_system.md")


def _get_search_fns(config: RunnableConfig) -> tuple[RagSearchFn | None, PresetSearchFn | None]:
    """从运行配置取用户绑定的双检索闭包；缺省时退化为纯简历上下文模式。"""
    configurable = (config or {}).get("configurable") or {}
    return configurable.get("rag_search"), configurable.get("preset_search")


def _transcript(messages: list, window: int) -> str:
    """最近 window 条消息渲染为对话记录（点评与作答的上下文）。"""
    lines: list[str] = []
    for msg in messages[-window:]:
        if isinstance(msg, HumanMessage):
            lines.append(f"面试官：{msg.content}")
        elif isinstance(msg, AIMessage):
            lines.append(f"候选人：{msg.content}")
    return "\n\n".join(lines)


async def wait_question(state: CandidateState, config: RunnableConfig) -> dict:
    """等问：挂起图执行等用户输入；恢复值为提问文本或 {"action": ...}。

    interrupt 必须是节点第一条语句（resume 后整个节点重执行）。
    提问分支显式重置动作标记与上一轮结果——否则上一轮 critique/finish
    标志残留会让条件边在下一轮死循环进同一节点（resume 值三分：str 提问 /
    dict critique / dict finish，与 interviewer.wait_answer 的双形态先例一致）。
    """
    resumed = interrupt({"awaiting_question": True})
    if isinstance(resumed, dict):
        action = resumed.get("action")
        if action == "critique":
            return {"critique_requested": True}
        if action == "finish":
            return {"finish_requested": True}
    question = str(resumed).strip()
    return {
        "phase": "questioning",
        "question_index": state["question_index"] + 1,
        "current_question": question,
        "critique_requested": False,
        "finish_requested": False,
        # 上一轮的作答与检索结果随新提问作废，避免泄入本轮 prompt
        "last_answer": "",
        "rag_context": "",
        "preset_answer": "",
        "preset_used": False,
        "messages": [HumanMessage(content=question)],
    }


def _route_after_wait(state: CandidateState) -> str:
    if state["finish_requested"]:
        return "finish"
    if state["critique_requested"]:
        return "critique"
    return "retrieve"


async def retrieve(state: CandidateState, config: RunnableConfig) -> dict:
    """检索：预设答案优先匹配（命中则作答以它为纲），简历切片做事实补充。"""
    rag_search, preset_search = _get_search_fns(config)
    question = state["current_question"]

    hit: PresetHit | None = None
    if preset_search is not None:
        hit = await preset_search(question)
    chunks: list[RetrievedChunk] = []
    if rag_search is not None:
        chunks = await rag_search(question)

    rag_context = "\n".join(f"- {c.content}" for c in chunks)
    logger.info(
        "求职者检索 index={} preset={} 简历切片={}",
        state["question_index"],
        hit is not None,
        len(chunks),
    )
    return {
        "rag_context": rag_context,
        "preset_answer": hit.answer if hit else "",
        "preset_used": hit is not None,
    }


async def generate_answer(state: CandidateState, config: RunnableConfig) -> dict:
    """作答：命中预设优先采用，否则依据简历切片/全文，缺失明确说不知道。"""
    answer = await get_chat_model().ainvoke(
        [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(
                content=render_prompt(
                    "candidate_answer.md",
                    question=state["current_question"],
                    preset_answer=state["preset_answer"],
                    rag_context=state["rag_context"],
                    resume_context=state["resume_context"],
                    transcript=_transcript(state["messages"], settings.interview_memory_window),
                )
            ),
        ]
    )
    return {
        "last_answer": str(answer.content).strip(),
        # 直接复用 LLM 返回的消息对象：保留其 id，使 langgraph messages
        # 流式对 node output 的 dedupe 生效，避免与 token chunk 重复（M4 踩坑）
        "messages": [answer],
    }


async def critique(state: CandidateState, config: RunnableConfig) -> dict:
    """点评：对最近一次问答结构化输出优点/不足/建议（E8）；失败降级不阻塞。"""
    structured = get_extract_model().with_structured_output(AnswerCritique)
    prompt = render_prompt(
        "candidate_critique.md",
        question=state["current_question"],
        answer=state["last_answer"],
        resume_context=state["resume_context"],
    )
    try:
        result = await structured.ainvoke(
            [SystemMessage(content=_SYSTEM_PROMPT), HumanMessage(content=prompt)]
        )
        critique_dict = result.model_dump()
    except Exception:
        # 结构化失败降级：点评不生成也不中断练习循环（R4，可再次请求）
        logger.exception("点评结构化输出失败 index={}", state["question_index"])
        critique_dict = {
            "strengths": [],
            "weaknesses": ["（点评生成失败，请稍后重新请求点评）"],
            "suggestions": [],
        }
    logger.info("点评完成 index={}", state["question_index"])
    # 点评不进 messages：对话历史只保留问答本身，避免污染下一轮作答上下文
    return {"critique": critique_dict}


async def finish(state: CandidateState, config: RunnableConfig) -> dict:
    """收尾：仅置阶段，不调 LLM（练习循环由用户随时主动结束）。"""
    return {"phase": "finished"}


def build_candidate_graph(checkpointer):
    """编译求职者图：checkpointer 由调用方管理生命周期（thread_id = 会话 id）。"""
    graph = StateGraph(CandidateState)
    graph.add_node("wait_question", wait_question)
    graph.add_node("retrieve", retrieve)
    graph.add_node("generate_answer", generate_answer)
    graph.add_node("critique", critique)
    graph.add_node("finish", finish)
    graph.add_edge(START, "wait_question")
    graph.add_conditional_edges(
        "wait_question",
        _route_after_wait,
        {"retrieve": "retrieve", "critique": "critique", "finish": "finish"},
    )
    graph.add_edge("retrieve", "generate_answer")
    graph.add_edge("generate_answer", "wait_question")
    graph.add_edge("critique", "wait_question")
    graph.add_edge("finish", END)
    return graph.compile(checkpointer=checkpointer)
