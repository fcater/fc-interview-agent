"""面试服务：会话编排（开始 / 推进图 / 快照恢复）与 QA 持久化。

图节点是纯函数（不碰业务库）：本服务监听 graph.astream 的 updates
事件完成 QA 落库与会话状态维护；messages 模式的 token 流与阶段事件
统一桥接为 SSE payload（E9）。业务数据在 PG、对话历史在 checkpoint，
两套持久化以 session.id（thread_id）对齐。

本文件只面向面试官图；求职者图（M6）独立编排，不复用本文件。
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Literal

from langchain_core.messages import AIMessageChunk
from langgraph.types import Command
from loguru import logger
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import NotFoundError
from app.knowledge import service as knowledge_service
from app.models import JD, InterviewQA, InterviewSession, Resume, User
from app.schemas.interview import (
    DoneEvent,
    ErrorEvent,
    InterviewStartRequest,
    PhaseEvent,
    TokenEvent,
)
from app.services import report_service

# ── 会话启动与上下文构造 ─────────────────────────────────────────


def _format_jd_key_points(jd: JD | None) -> str:
    """把 JD 结构化要点渲染为 Prompt 友好的文本（无 JD 或未提取时为空）。"""
    if jd is None or not jd.key_points:
        return ""
    kp = jd.key_points
    lines = [f"岗位：{kp.get('position', '')}"]
    sections = [
        ("核心职责", "responsibilities"),
        ("必备技能", "required_skills"),
        ("加分技能", "preferred_skills"),
        ("经验要求", "experience_requirements"),
        ("软技能", "soft_skills"),
    ]
    for label, key in sections:
        items = [str(i) for i in kp.get(key) or []]
        if items:
            lines.append(f"{label}：{'、'.join(items)}")
    return "\n".join(lines)


def _build_initial_state(session: InterviewSession, resume: Resume, jd: JD | None) -> dict:
    """构造图初始状态（仅首题生成前使用；之后状态由 checkpoint 接管）。"""
    return {
        "phase": "opening",
        "question_index": 0,
        "max_questions": settings.interview_max_questions,
        "follow_up_round": 0,
        "max_follow_ups": settings.interview_max_follow_ups,
        "current_question": "",
        "topic": "",
        "last_answer": "",
        "assessment": "",
        "need_follow_up": False,
        "follow_up_point": "",
        "resume_context": resume.content,
        "jd_key_points": _format_jd_key_points(jd),
        "jd_skills": list((jd.key_points or {}).get("required_skills") or []),
        "asked_questions": [],
        "abort_requested": False,
        "summary": "",
    }


async def start_interview(
    db: AsyncSession, user: User, payload: InterviewStartRequest
) -> InterviewSession:
    """开始面试：校验简历/JD 归属（越权 404）后创建会话行。"""
    resume = await db.get(Resume, payload.resume_id)
    if resume is None or resume.user_id != user.id:
        raise NotFoundError("简历不存在")
    jd: JD | None = None
    if payload.jd_id is not None:
        jd = await db.get(JD, payload.jd_id)
        if jd is None or jd.user_id != user.id:
            raise NotFoundError("JD 不存在")
    session = InterviewSession(
        user_id=user.id,
        resume_id=resume.id,
        jd_id=jd.id if jd else None,
        # role 默认 interviewer（M6 求职者图为独立入口，不经此服务）
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    logger.info(
        "面试会话创建 id={} user_id={} resume_id={} jd_id={}",
        session.id,
        user.id,
        resume.id,
        payload.jd_id,
    )
    return session


async def get_owned_session(
    db: AsyncSession, user: User, session_id: int
) -> InterviewSession:
    """按 id 取当前用户的面试会话；不存在或属于他人一律 404。"""
    session = await db.get(InterviewSession, session_id)
    if session is None or session.user_id != user.id:
        raise NotFoundError("面试会话不存在")
    return session


def _make_rag_search(user_id: int):
    """为当前用户绑定检索闭包，经 graph config 注入出题节点（E7：隔离收敛在此）。"""

    async def rag_search(topic: str):
        return await knowledge_service.search(topic, user_id=user_id)

    return rag_search


# ── 图推进与事件桥接 ─────────────────────────────────────────────


@dataclass
class StreamAction:
    """一次流式推进的动作：首题 / 提交回答 / 提前结束。"""

    kind: Literal["start", "answer", "finish"]
    content: str = ""


def _extract_text(content: Any) -> str:
    """取消息块文本（模型 content 可能是 str 或分块 list）。"""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"
        )
    return ""


async def _upsert_qa(
    db: AsyncSession,
    user: User,
    session: InterviewSession,
    question_index: int,
    follow_up_round: int,
    delta: dict,
) -> None:
    """按（session, 题号, 追问轮）落库/更新问题行（generate_question / follow_up 完成时）。"""
    row = (
        await db.scalars(
            select(InterviewQA).where(
                InterviewQA.session_id == session.id,
                InterviewQA.question_index == question_index,
                InterviewQA.follow_up_round == follow_up_round,
            )
        )
    ).first()
    if row is None:
        row = InterviewQA(
            session_id=session.id,
            user_id=user.id,
            question_index=question_index,
            follow_up_round=follow_up_round,
            question=delta["current_question"],
            question_type=delta.get("question_type"),
        )
        db.add(row)
    else:
        row.question = delta["current_question"]
        if delta.get("question_type"):
            row.question_type = delta["question_type"]
    # 同步维护会话主问题数：中途快照/会话列表读该列，不能只在收尾时更新
    session.question_count = await _question_count(db, session)
    await db.commit()


async def _save_assessment(
    db: AsyncSession,
    session: InterviewSession,
    question_index: int,
    follow_up_round: int,
    answer: str,
    delta: dict,
) -> None:
    """判答完成：把回答与简评写入当前题（question_index + 当前追问轮）行。"""
    row = (
        await db.scalars(
            select(InterviewQA).where(
                InterviewQA.session_id == session.id,
                InterviewQA.question_index == question_index,
                InterviewQA.follow_up_round == follow_up_round,
            )
        )
    ).first()
    if row is not None:
        row.answer = answer
        row.assessment = delta["assessment"]
        await db.commit()


async def _question_count(db: AsyncSession, session: InterviewSession) -> int:
    """主问题数（去重题号，含追问不计）。"""
    return (
        await db.scalar(
            select(func.count(distinct(InterviewQA.question_index))).where(
                InterviewQA.session_id == session.id
            )
        )
    ) or 0


async def _finalize(db: AsyncSession, session: InterviewSession, *, aborted: bool) -> str:
    """收尾落库：状态与主问题数，并调度评分报告后台生成（M5）；返回最终 status。"""
    session.status = "aborted" if aborted else "completed"
    session.question_count = await _question_count(db, session)
    await db.commit()
    # 报告生成是终局后处理：异步调度（done 立即返回），失败由 POST /report 补生成兜底
    report_service.schedule_report_task(session.id)
    logger.info(
        "面试会话结束 id={} status={} question_count={}",
        session.id,
        session.status,
        session.question_count,
    )
    return session.status


async def stream_events(
    graph, db: AsyncSession, user: User, session: InterviewSession, action: StreamAction
) -> AsyncIterator[dict]:
    """推进面试图到下一个 interrupt / END，逐事件产出 SSE payload（dict）。

    一次 astream 从当前检查点运行到下一个 wait_answer 中断（或收尾 END），
    中途产出：token（流式文本）、phase（出题完成/判答完成）、done（本轮流结束）。
    """
    config = {
        "configurable": {
            "thread_id": str(session.id),
            "rag_search": _make_rag_search(user.id),
        }
    }
    snapshot = await graph.aget_state(config)

    # 会话已结束：不再推进图，直接下发终态（重复 finish 幂等；避免 SSE 内抛错留 ASGI 堆栈）
    if session.status != "in_progress":
        yield DoneEvent(
            status=session.status,
            question_count=session.question_count,
            summary=(snapshot.values or {}).get("summary") or None,
        ).model_dump()
        return

    # ── 组装本轮输入 ─────────────────────────────────────────────
    if action.kind == "start":
        if snapshot.values.get("current_question"):
            # 会话已出过题（中断在等答或已结束）：无可流内容，前端以快照恢复。
            # 注意不能用 has_checkpoint 判定：LangGraph 首次执行前会把初始
            # state 写入 checkpoint，失败残留时 values 非空但首题并未生成。
            count = await _question_count(db, session)
            yield DoneEvent(status=session.status, question_count=count).model_dump()
            return
        resume = await db.get(Resume, session.resume_id)
        jd = await db.get(JD, session.jd_id) if session.jd_id else None
        if resume is None:
            # 关联简历已被删除：SSE 响应头已发出无法改状态码，走流内错误事件
            yield ErrorEvent(message="关联简历已不存在，该会话无法继续").model_dump()
            yield DoneEvent(
                status=session.status, question_count=await _question_count(db, session)
            ).model_dump()
            return
        # 传完整初始 state：即使 checkpoint 有失败残留也整体重置重新生成首题
        graph_input: Any = _build_initial_state(session, resume, jd)
    else:
        if "wait_answer" not in (snapshot.next or ()):
            # 不在等答点：回答属重复提交（SSE 已 200，无法改状态码，走流内错误事件）；
            # 结束则直接落库收尾（提前结束随时生效）
            if action.kind == "finish":
                status = await _finalize(db, session, aborted=True)
                yield DoneEvent(status=status, question_count=session.question_count).model_dump()
                return
            yield ErrorEvent(message="当前没有等待回答的问题，请刷新页面恢复进度").model_dump()
            yield DoneEvent(
                status=session.status, question_count=await _question_count(db, session)
            ).model_dump()
            return
        graph_input = (
            Command(resume=action.content)
            if action.kind == "answer"
            else Command(resume={"action": "finish"})
        )

    # ── 流式推进：messages 吐 token，updates 驱动落库与阶段事件 ──
    finished_status: str | None = None
    summary: str | None = None
    # LangGraph updates 只含节点变更字段；用服务层变量跟踪当前（题号, 追问轮），
    # 落库与阶段事件以它为权威位置（evaluate_answer 的 delta 不含这两个字段）。
    # last_answer 由 wait_answer 节点产出，同样不在 evaluate_answer 的 delta 里。
    cur_index = snapshot.values.get("question_index") or 0
    cur_round = snapshot.values.get("follow_up_round") or 0
    cur_last_answer = snapshot.values.get("last_answer") or ""
    try:
        async for mode, payload in graph.astream(
            graph_input, config, stream_mode=["messages", "updates"]
        ):
            if mode == "messages":
                chunk, metadata = payload
                # 只外发 LLM token：节点写入的完整消息（如回答 HumanMessage）也会被
                # messages 模式发出，不过滤会在评估期间把用户回答回显进 AI 气泡
                if not isinstance(chunk, AIMessageChunk):
                    continue
                node = metadata.get("langgraph_node")
                # 判答为结构化输出（JSON token），不外发；前端以 assessed 事件获取简评
                if node == "evaluate_answer":
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
                if node in ("generate_question", "follow_up"):
                    # follow_up 为同题追问，不改 question_index，delta 中缺省
                    cur_index = delta.get("question_index", cur_index)
                    cur_round = delta.get("follow_up_round", cur_round)
                    await _upsert_qa(
                        db, user, session, cur_index, cur_round, delta
                    )
                    yield PhaseEvent(
                        phase="awaiting_answer",
                        question_index=cur_index,
                        follow_up_round=cur_round,
                        question=delta["current_question"],
                        question_type=delta.get("question_type"),
                    ).model_dump()
                elif node == "wait_answer":
                    if "last_answer" in delta:
                        cur_last_answer = delta["last_answer"]
                elif node == "evaluate_answer":
                    await _save_assessment(
                        db, session, cur_index, cur_round, cur_last_answer, delta
                    )
                    yield PhaseEvent(
                        phase="assessed",
                        question_index=cur_index,
                        follow_up_round=cur_round,
                        assessment=delta["assessment"],
                        need_follow_up=delta["need_follow_up"],
                    ).model_dump()
    except Exception:
        # LLM/流程失败：会话保持 in_progress，可刷新恢复重试（R4/R5）
        logger.exception("面试流式推进失败 session_id={}", session.id)
        yield ErrorEvent(message="面试流程执行失败，请稍后重试或刷新页面恢复").model_dump()
        yield DoneEvent(
            status=session.status, question_count=await _question_count(db, session)
        ).model_dump()
        return

    final = await graph.aget_state(config)
    state_values = final.values or {}
    if state_values.get("phase") == "finished":
        finished_status = await _finalize(db, session, aborted=state_values["abort_requested"])
        summary = state_values.get("summary") or None
        yield DoneEvent(
            status=finished_status,
            question_count=session.question_count,
            summary=summary,
        ).model_dump()
    else:
        # 停在 wait_answer 中断：等待下一次作答
        yield DoneEvent(
            status="in_progress", question_count=await _question_count(db, session)
        ).model_dump()


# ── 快照恢复 ─────────────────────────────────────────────────────


async def get_snapshot(
    graph, db: AsyncSession, user: User, session_id: int
) -> dict:
    """会话快照：刷新/重连后前端重建视图的唯一数据源。"""
    session = await get_owned_session(db, user, session_id)
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

    current_question = values.get("current_question") or None
    return {
        "session": session,  # from_attributes 由路由层 response_model 序列化
        "phase": values.get("phase") or "opening",
        "question_index": values.get("question_index") or 0,
        "follow_up_round": values.get("follow_up_round") or 0,
        "max_questions": settings.interview_max_questions,
        "current_question": current_question,
        "question_type": values.get("question_type"),
        "summary": values.get("summary") or None,
        "needs_stream": session.status == "in_progress" and not current_question,
        "qa_history": qa_rows,
    }
