"""评分报告服务（M5）：transcript 拼装、报告生成落库、列表与补生成。

报告生成是终局后处理：interview_service._finalize（三条结束路径的汇聚点）
调度后台任务异步生成（面试 SSE 的 done 立即返回，前端轮询取报告）；
POST /report 为幂等补生成入口（M4 旧会话回填 / 进程重启丢任务兜底）。

注意：本服务不导入 interview_service（后者 Step 接线时反向依赖本模块），
JD 要点格式化在此本地实现（与 interview_service._format_jd_key_points 同源）。
"""

import asyncio

from loguru import logger
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.report import generate_report
from app.core.db import SessionLocal
from app.core.exceptions import ConflictError, NotFoundError
from app.models import JD, EvaluationReport, InterviewQA, InterviewSession, Resume, User
from app.schemas.report import InterviewRecordBrief, InterviewReport

# 后台任务引用：防止 asyncio.create_task 的协程被 GC；完成后自动移除
_tasks: set[asyncio.Task] = set()
# 生成中的会话 id：并发补生成与轮询的轻量互斥标记
_inflight: set[int] = set()

_QUESTION_TYPE_LABELS = {"basic": "基础", "project": "项目", "deep_dive": "深挖"}


def _type_label(question_type: str | None) -> str:
    if not question_type:
        return "综合"
    return _QUESTION_TYPE_LABELS.get(question_type, question_type)


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


def _build_transcript(qa_rows: list[InterviewQA]) -> str:
    """问答记录 → 评分链输入文本（按题号与追问轮排序）。"""
    lines: list[str] = []
    for row in sorted(qa_rows, key=lambda r: (r.question_index, r.follow_up_round)):
        lines.append(f"【第{row.question_index}题·{_type_label(row.question_type)}】{row.question}")
        lines.append(f"回答：{row.answer or '（未回答）'}")
        if row.assessment:
            lines.append(f"面试官简评：{row.assessment}")
        lines.append("")
    return "\n".join(lines).strip()


# ── 报告生成与落库 ───────────────────────────────────────────────


async def _generate_for_session(db: AsyncSession, session: InterviewSession) -> EvaluationReport:
    """收集上下文 → 调评分链 → 落库（调用方负责会话生命周期与并发控制）。"""
    resume = await db.get(Resume, session.resume_id) if session.resume_id else None
    jd = await db.get(JD, session.jd_id) if session.jd_id else None
    qa_rows = (
        await db.scalars(select(InterviewQA).where(InterviewQA.session_id == session.id))
    ).all()
    report: InterviewReport = await generate_report(
        resume_context=resume.content if resume else "",
        jd_key_points=_format_jd_key_points(jd),
        qa_transcript=_build_transcript(list(qa_rows)),
    )
    row = EvaluationReport(
        session_id=session.id,
        user_id=session.user_id,
        overall_score=report.overall_score,
        report=report.model_dump(),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    logger.info("评分报告落库 session_id={} overall={}", session.id, report.overall_score)
    return row


async def _run_report_task(session_id: int) -> None:
    """后台任务体：自建 DB 会话；异常只记日志绝不外泄（任务失败由补生成兜底）。"""
    _inflight.add(session_id)
    try:
        async with SessionLocal() as db:
            session = await db.get(InterviewSession, session_id)
            if session is None:
                logger.warning("评分报告任务跳过：会话不存在 id={}", session_id)
                return
            await _generate_for_session(db, session)
    except Exception:
        logger.exception(
            "评分报告后台生成失败 session_id={}（可经 POST /report 补生成）", session_id
        )
    finally:
        _inflight.discard(session_id)


def schedule_report_task(session_id: int) -> None:
    """面试收尾后调度报告生成（异步，不阻塞 done 事件）；调度失败不影响收尾。"""
    try:
        task = asyncio.create_task(_run_report_task(session_id))
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)
    except Exception:
        logger.exception("评分报告任务调度失败 session_id={}", session_id)


# ── 查询与补生成 ─────────────────────────────────────────────────


async def get_report(db: AsyncSession, user: User, session_id: int) -> EvaluationReport:
    """当前用户的某场面试评分报告；不存在（未生成/他人）一律 404（E7）。"""
    row = (
        await db.scalars(
            select(EvaluationReport).where(
                EvaluationReport.session_id == session_id,
                EvaluationReport.user_id == user.id,
            )
        )
    ).first()
    if row is None:
        raise NotFoundError("评分报告尚未生成")
    return row


async def list_interviews(db: AsyncSession, user: User) -> list[InterviewRecordBrief]:
    """历史面试列表：会话 + 简历/JD 标题 + 综合评分（不分页，按时间倒序）。"""
    rows = (
        await db.execute(
            select(
                InterviewSession,
                Resume.title,
                JD.title,
                EvaluationReport.overall_score,
            )
            .join(Resume, InterviewSession.resume_id == Resume.id, isouter=True)
            .join(JD, InterviewSession.jd_id == JD.id, isouter=True)
            .join(
                EvaluationReport,
                EvaluationReport.session_id == InterviewSession.id,
                isouter=True,
            )
            .where(InterviewSession.user_id == user.id)
            .order_by(InterviewSession.created_at.desc())
        )
    ).all()
    return [
        InterviewRecordBrief(
            id=session.id,
            status=session.status,
            role=session.role,
            question_count=session.question_count,
            created_at=session.created_at,
            resume_title=resume_title,
            jd_title=jd_title,
            overall_score=overall_score,
        )
        for session, resume_title, jd_title, overall_score in rows
    ]


async def ensure_report(db: AsyncSession, session: InterviewSession) -> EvaluationReport:
    """幂等补生成：已有直接返回；未结束 409；生成中 409；并发落库冲突回查既有行。"""
    existing = (
        await db.scalars(
            select(EvaluationReport).where(EvaluationReport.session_id == session.id)
        )
    ).first()
    if existing is not None:
        return existing
    if session.status not in ("completed", "aborted"):
        raise ConflictError("面试尚未结束，暂无评分报告")
    if session.id in _inflight:
        raise ConflictError("评分报告正在生成中，请稍候")
    # 与后台任务共用同一互斥标记：并发手动 POST 只允许一个跑完整 LLM 生成，
    # 另一个 409（落库冲突由唯一约束 + IntegrityError 回查兜底）
    _inflight.add(session.id)
    try:
        return await _generate_for_session(db, session)
    except IntegrityError:
        # 后台任务抢先落库：回滚后返回既有行（唯一约束保证只有一份）
        await db.rollback()
        row = (
            await db.scalars(
                select(EvaluationReport).where(EvaluationReport.session_id == session.id)
            )
        ).first()
        if row is None:
            raise
        return row
    finally:
        _inflight.discard(session.id)
