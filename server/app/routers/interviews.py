"""面试路由（M4）：开始 / 快照恢复 / 三个 SSE 流式端点（首题、作答、提前结束）。

SSE 用 fastapi.sse（POST 可携带 JWT；EventSource 不支持自定义 Header，
前端走 fetch ReadableStream 自行解析，见 tech-stack §3）。流式端点为
async generator，yield ServerSentEvent，由路由层声明 EventSourceResponse。
"""

from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.db import get_db
from app.models import InterviewSession, User
from app.schemas.interview import (
    InterviewAnswerRequest,
    InterviewSessionBrief,
    InterviewSnapshotResponse,
    InterviewStartRequest,
)
from app.services import interview_service
from app.services.interview_service import StreamAction

router = APIRouter(prefix="/interviews", tags=["interviews"])


def _graph(request: Request):
    """取 lifespan 编译好的面试官图单例。"""
    return request.app.state.interviewer_graph


async def _sse_events(
    events: AsyncIterator[dict],
) -> AsyncIterator[ServerSentEvent]:
    """把服务层事件 dict 流逐个包装为 SSE 事件（data 为 JSON）。

    本 FastAPI 版本的 SSE 端点要求路由函数本身是 async generator
    （is_sse_stream 分支直接迭代 dependant.call() 的结果），
    因此这里不用 EventSourceResponse(...) 一次性包装，而是逐条 yield。
    """
    async for event in events:
        yield ServerSentEvent(data=event)


async def _owned_session(
    session_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewSession:
    """归属校验做成依赖：依赖解析先于 SSE 响应开始，越权/不存在时全局
    异常处理器可正常返回 404（E7）；若放在生成器体内，异常会被
    SSE producer 吞掉变成 200 空流。"""
    return await interview_service.get_owned_session(db, user, session_id)


@router.post("", response_model=InterviewSessionBrief, status_code=201)
async def start_interview(
    payload: InterviewStartRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewSessionBrief:
    """创建面试会话（校验简历/JD 归属；返回会话信息，前端跳面试页开首题流）。"""
    session = await interview_service.start_interview(db, user, payload)
    return InterviewSessionBrief.model_validate(session)


@router.get("/{session_id}/snapshot", response_model=InterviewSnapshotResponse)
async def get_snapshot(
    session_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewSnapshotResponse:
    """会话快照：刷新/重连后重建视图（含是否需要开流生成首题的判定）。"""
    return InterviewSnapshotResponse.model_validate(
        await interview_service.get_snapshot(_graph(request), db, user, session_id)
    )


@router.post("/{session_id}/stream", response_class=EventSourceResponse)
async def stream_first_question(
    request: Request,
    session: InterviewSession = Depends(_owned_session),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AsyncIterator[ServerSentEvent]:
    """SSE：生成首题（仅新会话；已推进过的会话返回 done 事件供前端走快照）。"""
    events = interview_service.stream_events(
        _graph(request), db, user, session, StreamAction(kind="start")
    )
    async for event in _sse_events(events):
        yield event


@router.post("/{session_id}/answers", response_class=EventSourceResponse)
async def submit_answer(
    payload: InterviewAnswerRequest,
    request: Request,
    session: InterviewSession = Depends(_owned_session),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AsyncIterator[ServerSentEvent]:
    """SSE：提交回答 → 判答（评估事件）→ 追问/下一题（流式）。"""
    events = interview_service.stream_events(
        _graph(request), db, user, session, StreamAction(kind="answer", content=payload.content)
    )
    async for event in _sse_events(events):
        yield event


@router.post("/{session_id}/finish", response_class=EventSourceResponse)
async def finish_interview(
    request: Request,
    session: InterviewSession = Depends(_owned_session),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AsyncIterator[ServerSentEvent]:
    """SSE：提前结束（随时生效）→ 流式收尾总结。"""
    events = interview_service.stream_events(
        _graph(request), db, user, session, StreamAction(kind="finish")
    )
    async for event in _sse_events(events):
        yield event
