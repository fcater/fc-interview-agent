"""求职者服务（M6）：会话编排（开始 / 推进图 / 快照恢复）与 QA 持久化。

本文件只面向求职者图（interview_service 只面向面试官图，两者独立编排
不复用）。图节点是纯函数：本服务监听 graph.astream 的 updates 事件完成
QA 落库与会话状态维护；messages 模式的 token 流与阶段事件统一桥接为
SSE payload（E9）。检索闭包在此按当前用户绑定注入（E7 隔离收敛点）。

与面试官流程的差异：无题数/追问轮次上限；收尾不生成评分报告（点评
按轮即时给出）；finish 视为练习正常完成（status=completed）。
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Literal

from langchain_core.messages import AIMessageChunk
from langgraph.types import Command
from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.knowledge import service as knowledge_service
from app.models import InterviewQA, InterviewSession, Resume, User
from app.models.interview_session import ROLE_CANDIDATE
from app.schemas.candidate import CandidatePhaseEvent, CandidateStartRequest
from app.schemas.interview import DoneEvent, ErrorEvent, TokenEvent

# ── 会话启动与上下文构造 ─────────────────────────────────────────


def _format_critique(critique: dict) -> str:
    """结构化点评 → assessment 落库文本（回看时直接展示）。"""
    sections = [
        ("优点", "strengths"),
        ("不足", "weaknesses"),
        ("改进建议", "suggestions"),
    ]
    lines: list[str] = []
    for label, key in sections:
        items = [str(i) for i in critique.get(key) or []]
        if items:
            lines.append(f"【{label}】" + "；".join(items))
    return "\n".join(lines)


async def start_candidate_session(
    db: AsyncSession, user: User, payload: CandidateStartRequest
) -> InterviewSession:
    """开始求职者练习：校验简历归属（越权 404）后创建 candidate 会话行。"""
    resume = await db.get(Resume, payload.resume_id)
    if resume is None or resume.user_id != user.id:
        raise NotFoundError("简历不存在")
    session = InterviewSession(user_id=user.id, resume_id=resume.id, role=ROLE_CANDIDATE)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    logger.info("求职者会话创建 id={} user_id={} resume_id={}", session.id, user.id, resume.id)
    return session


async def get_owned_candidate_session(
    db: AsyncSession, user: User, session_id: int
) -> InterviewSession:
    """按 id 取当前用户的求职者会话；不存在/他人/面试官会话一律 404（E7）。"""
    session = await db.get(InterviewSession, session_id)
    if session is None or session.user_id != user.id or session.role != ROLE_CANDIDATE:
        raise NotFoundError("面试会话不存在")
    return session


def _make_rag_search(user_id: int):
    """为当前用户绑定简历检索闭包（E7：隔离收敛在此）。"""

    async def rag_search(topic: str):
        return await knowledge_service.search(topic, user_id=user_id)

    return rag_search


def _make_preset_search(user_id: int):
    """为当前用户绑定预设答案匹配闭包（E6/E7）。"""

    async def preset_search(query: str):
        return await knowledge_service.search_presets(query, user_id=user_id)

    return preset_search


def _build_initial_state(session: InterviewSession, resume: Resume) -> dict:
    """构造图初始状态（仅首次 start 使用；之后状态由 checkpoint 接管）。"""
    return {
        "phase": "opening",
        "question_index": 0,
        "current_question": "",
        "last_answer": "",
        "resume_context": resume.content,
        "rag_context": "",
        "preset_answer": "",
        "preset_used": False,
        "critique_requested": False,
        "finish_requested": False,
        "critique": None,
    }


# ── 图推进与事件桥接 ─────────────────────────────────────────────


@dataclass
class CandidateAction:
    """一次流式推进的动作：初始化/恢复 / 提问 / 点评 / 结束。"""

    kind: Literal["start", "ask", "critique", "finish"]
    content: str = ""


def _extract_text(content: Any) -> str:
    """取消息块文本（模型 content 可能是 str 或分块 list）。

    与 interview_service._extract_text 同源但独立维护：两个服务刻意
    不互相依赖，此处复制 8 行换取两条循环彻底解耦。
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"
        )
    return ""


async def _question_count(db: AsyncSession, session: InterviewSession) -> int:
    """已提问数（每轮提问一行，追问概念不存在）。"""
    return (
        await db.scalar(
            select(InterviewQA).with_only_columns(func.count()).where(
                InterviewQA.session_id == session.id
            )
        )
        or 0
    )


async def _upsert_question(
    db: AsyncSession, user: User, session: InterviewSession, question_index: int, question: str
) -> None:
    """提问落库（wait_question 提问分支完成时；follow_up_round 恒 0）。"""
    row = (
        await db.scalars(
            select(InterviewQA).where(
                InterviewQA.session_id == session.id,
                InterviewQA.question_index == question_index,
                InterviewQA.follow_up_round == 0,
            )
        )
    ).first()
    if row is None:
        db.add(
            InterviewQA(
                session_id=session.id,
                user_id=user.id,
                question_index=question_index,
                question=question,
            )
        )
    else:
        # 断连恢复重放同一轮：覆盖为规范提问文本
        row.question = question
    session.question_count = await _question_count(db, session)
    await db.commit()


async def _save_answer(
    db: AsyncSession, session: InterviewSession, question_index: int, answer: str
) -> None:
    """作答完成：回答写入当前轮问题行。"""
    row = (
        await db.scalars(
            select(InterviewQA).where(
                InterviewQA.session_id == session.id,
                InterviewQA.question_index == question_index,
                InterviewQA.follow_up_round == 0,
            )
        )
    ).first()
    if row is not None:
        row.answer = answer
        await db.commit()


async def _save_critique(
    db: AsyncSession, session: InterviewSession, question_index: int, critique: dict
) -> None:
    """点评完成：格式化文本写入当前轮的 assessment 列（回看展示）。"""
    row = (
        await db.scalars(
            select(InterviewQA).where(
                InterviewQA.session_id == session.id,
                InterviewQA.question_index == question_index,
                InterviewQA.follow_up_round == 0,
            )
        )
    ).first()
    if row is not None:
        row.assessment = _format_critique(critique)
        await db.commit()


async def _finalize(db: AsyncSession, session: InterviewSession) -> str:
    """收尾落库：练习正常完成；不生成评分报告（求职者模式无评分语义）。"""
    session.status = "completed"
    session.question_count = await _question_count(db, session)
    await db.commit()
    logger.info("求职者会话结束 id={} question_count={}", session.id, session.question_count)
    return session.status


async def stream_events(
    graph, db: AsyncSession, user: User, session: InterviewSession, action: CandidateAction
) -> AsyncIterator[dict]:
    """推进求职者图到下一个 interrupt / END，逐事件产出 SSE payload（dict）。

    一次 astream 从当前检查点运行到下一个 wait_question 中断（或收尾 END），
    中途产出：token（AI 回答流式文本）、phase（作答完成/点评完成）、done。
    start 动作兼做断连恢复：checkpoint 停在流程中段时以 None 输入续跑
    （interrupt 节点重执行时因无 resume 值原点重挂，天然幂等）。
    """
    config = {
        "configurable": {
            "thread_id": str(session.id),
            "rag_search": _make_rag_search(user.id),
            "preset_search": _make_preset_search(user.id),
        }
    }
    snapshot = await graph.aget_state(config)

    # 会话已结束：不再推进图，直接下发终态（重复 finish 幂等）
    if session.status != "in_progress":
        yield DoneEvent(status=session.status, question_count=session.question_count).model_dump()
        return

    # ── 组装本轮输入 ─────────────────────────────────────────────
    if action.kind == "start":
        if snapshot.values:
            # 已有 checkpoint（中断在等问或流程中段）：None 输入续跑到下一个中断
            graph_input: Any = None
        else:
            resume = await db.get(Resume, session.resume_id)
            if resume is None:
                # 关联简历已被删除：SSE 响应头已发出无法改状态码，走流内错误事件
                yield ErrorEvent(message="关联简历已不存在，该会话无法继续").model_dump()
                yield DoneEvent(
                    status=session.status, question_count=session.question_count
                ).model_dump()
                return
            graph_input = _build_initial_state(session, resume)
    else:
        if "wait_question" not in (snapshot.next or ()):
            # 不在等问点：提问/点评属重复提交（SSE 已 200，无法改状态码，走流内错误）；
            # 结束则直接落库收尾（结束随时生效）
            if action.kind == "finish":
                status = await _finalize(db, session)
                yield DoneEvent(status=status, question_count=session.question_count).model_dump()
                return
            yield ErrorEvent(message="当前没有等待输入的问题，请刷新页面恢复进度").model_dump()
            yield DoneEvent(
                status=session.status, question_count=session.question_count
            ).model_dump()
            return
        graph_input = {
            "ask": Command(resume=action.content),
            "critique": Command(resume={"action": "critique"}),
            "finish": Command(resume={"action": "finish"}),
        }[action.kind]

    # ── 流式推进：messages 吐 token，updates 驱动落库与阶段事件 ──
    # 服务层变量跟踪当前轮位置与检索结果（generate_answer 的 delta 不含它们）
    cur_index = snapshot.values.get("question_index") or 0
    cur_question = snapshot.values.get("current_question") or ""
    cur_preset_used = bool(snapshot.values.get("preset_used"))
    try:
        async for mode, payload in graph.astream(
            graph_input, config, stream_mode=["messages", "updates"]
        ):
            if mode == "messages":
                chunk, metadata = payload
                # 只外发 LLM token：节点写入的完整消息（如提问 HumanMessage）也会被
                # messages 模式发出，不过滤会把用户提问回显进回答气泡
                if not isinstance(chunk, AIMessageChunk):
                    continue
                node = metadata.get("langgraph_node")
                # 点评为结构化输出（JSON token），不外发；前端以 critiqued 事件获取
                if node == "critique":
                    continue
                text = _extract_text(chunk.content)
                if text:
                    yield TokenEvent(content=text, node=node).model_dump()
                continue

            for node, delta in payload.items():
                if node == "__interrupt__":
                    continue
                if not isinstance(delta, dict):
                    continue
                if node == "wait_question" and "current_question" in delta:
                    # 提问分支完成：落库问题行（critique/finish 分支无此字段，跳过）
                    cur_index = delta["question_index"]
                    cur_question = delta["current_question"]
                    await _upsert_question(db, user, session, cur_index, cur_question)
                elif node == "retrieve":
                    cur_preset_used = bool(delta.get("preset_used"))
                elif node == "generate_answer":
                    await _save_answer(db, session, cur_index, delta["last_answer"])
                    yield CandidatePhaseEvent(
                        phase="answered",
                        question_index=cur_index,
                        question=cur_question,
                        answer=delta["last_answer"],
                        used_preset=cur_preset_used,
                    ).model_dump()
                elif node == "critique":
                    critique = delta["critique"]
                    await _save_critique(db, session, cur_index, critique)
                    yield CandidatePhaseEvent(
                        phase="critiqued",
                        question_index=cur_index,
                        critique=critique,
                    ).model_dump()
    except Exception:
        # LLM/流程失败：会话保持 in_progress，可刷新恢复重试（R4/R5）
        logger.exception("求职者流式推进失败 session_id={}", session.id)
        yield ErrorEvent(message="回答生成失败，请稍后重试或刷新页面恢复").model_dump()
        yield DoneEvent(
            status=session.status, question_count=session.question_count
        ).model_dump()
        return

    final = await graph.aget_state(config)
    state_values = final.values or {}
    if state_values.get("phase") == "finished":
        status = await _finalize(db, session)
        yield DoneEvent(status=status, question_count=session.question_count).model_dump()
    else:
        # 停在 wait_question 中断：等待下一次输入
        yield DoneEvent(status="in_progress", question_count=session.question_count).model_dump()


# ── 快照恢复 ─────────────────────────────────────────────────────


async def get_snapshot(graph, db: AsyncSession, user: User, session_id: int) -> dict:
    """求职者会话快照：刷新/重连后前端重建视图的唯一数据源。"""
    session = await get_owned_candidate_session(db, user, session_id)
    qa_rows = (
        await db.scalars(
            select(InterviewQA)
            .where(InterviewQA.session_id == session.id)
            .order_by(InterviewQA.question_index, InterviewQA.follow_up_round)
        )
    ).all()
    config = {"configurable": {"thread_id": str(session.id)}}
    final = await graph.aget_state(config)
    values: dict = final.values or {}
    # 是否停在等问中断：在 = 常规等待输入（不开流）；不在 = 流程中段
    at_interrupt = "wait_question" in (final.next or ())
    last_unanswered = bool(qa_rows) and qa_rows[-1].answer is None

    return {
        "session": session,  # from_attributes 由路由层 response_model 序列化
        "phase": values.get("phase") or "opening",
        "question_count": session.question_count,
        # needs_stream 以 qa_history 为权威（checkpoint 初始态写入时机不可靠）：
        # 进行中且（尚无问答历史 → 图初始化；最后一问未作答且不在等问点 →
        # 作答中断线，以 None 输入续跑到下一中断）
        "needs_stream": session.status == "in_progress"
        and (not qa_rows or (last_unanswered and not at_interrupt)),
        "qa_history": qa_rows,
    }
