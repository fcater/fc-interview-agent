"""求职者路由（M6）：练习会话创建、快照恢复、四个 SSE 流式端点。

SSE 模式与 interviews.py 一致：归属校验做成依赖（先于 SSE 响应开始，
越权/不存在由全局异常处理器返回 404，避免被 SSE producer 吞成 200 空流），
端点为 async generator 逐条 yield ServerSentEvent。
"""

from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.db import get_db
from app.models import InterviewSession, User
from app.schemas.candidate import (
    CandidateQuestionRequest,
    CandidateSnapshotResponse,
    CandidateStartRequest,
)
from app.schemas.interview import InterviewSessionBrief
from app.services import candidate_service
from app.services.candidate_service import CandidateAction

router = APIRouter(prefix="/candidate", tags=["candidate"])


def _graph(request: Request):
    """取 lifespan 编译好的求职者图单例。"""
    return request.app.state.candidate_graph


async def _sse_events(
    events: AsyncIterator[dict],
) -> AsyncIterator[ServerSentEvent]:
    """把服务层事件 dict 流逐个包装为 SSE 事件（data 为 JSON）。"""
    async for event in events:
        yield ServerSentEvent(data=event)


async def _owned_session(
    session_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewSession:
    """归属 + role 校验依赖：面试官会话传到求职者端点同样 404（E7）。"""
    return await candidate_service.get_owned_candidate_session(db, user, session_id)


@router.post("/sessions", response_model=InterviewSessionBrief, status_code=201)
async def start_session(
    payload: CandidateStartRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewSessionBrief:
    """创建求职者练习会话（校验简历归属；前端跳会话页开初始化流）。"""
    session = await candidate_service.start_candidate_session(db, user, payload)
    return InterviewSessionBrief.model_validate(session)


@router.get("/sessions/{session_id}/snapshot", response_model=CandidateSnapshotResponse)
async def get_snapshot(
    session_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CandidateSnapshotResponse:
    """会话快照：刷新/重连后重建视图（needs_stream 判定是否开初始化流）。"""
    return CandidateSnapshotResponse.model_validate(
        await candidate_service.get_snapshot(_graph(request), db, user, session_id)
    )


@router.post("/sessions/{session_id}/stream", response_class=EventSourceResponse)
async def stream_init(
    request: Request,
    session: InterviewSession = Depends(_owned_session),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AsyncIterator[ServerSentEvent]:
    """SSE：初始化图到首个等问中断（无 LLM 调用）；兼做断连恢复（续跑到中断）。"""
    events = candidate_service.stream_events(
        _graph(request), db, user, session, CandidateAction(kind="start")
    )
    async for event in _sse_events(events):
        yield event


@router.post("/sessions/{session_id}/questions", response_class=EventSourceResponse)
async def ask_question(
    payload: CandidateQuestionRequest,
    request: Request,
    session: InterviewSession = Depends(_owned_session),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AsyncIterator[ServerSentEvent]:
    """SSE：提问 → 检索（预设/简历）→ 流式作答。"""
    events = candidate_service.stream_events(
        _graph(request), db, user, session, CandidateAction(kind="ask", content=payload.content)
    )
    async for event in _sse_events(events):
        yield event


@router.post("/sessions/{session_id}/critique", response_class=EventSourceResponse)
async def critique_answer(
    request: Request,
    session: InterviewSession = Depends(_owned_session),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AsyncIterator[ServerSentEvent]:
    """SSE：请求点评上一轮问答（结构化优点/不足/建议）。"""
    events = candidate_service.stream_events(
        _graph(request), db, user, session, CandidateAction(kind="critique")
    )
    async for event in _sse_events(events):
        yield event


@router.post("/sessions/{session_id}/finish", response_class=EventSourceResponse)
async def finish_session(
    request: Request,
    session: InterviewSession = Depends(_owned_session),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AsyncIterator[ServerSentEvent]:
    """SSE：结束练习（随时生效，视为正常完成，无评分报告）。"""
    events = candidate_service.stream_events(
        _graph(request), db, user, session, CandidateAction(kind="finish")
    )
    async for event in _sse_events(events):
        yield event
