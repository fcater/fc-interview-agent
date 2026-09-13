"""简历路由：上传（解析 → 脱敏 → 入库）/ 列表 / 详情 / 删除（用户隔离）。

入库内容为脱敏后的 Markdown（验收：库内手机号/邮箱已被替换）。
"""

from fastapi import APIRouter, Depends
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.db import get_db
from app.core.exceptions import NotFoundError
from app.knowledge.parsers import get_parser
from app.knowledge.sanitizer import sanitize_text
from app.knowledge.service import delete_resume_vectors, ingest_resume
from app.models import Resume, User
from app.schemas.resume import ResumeBrief, ResumeCreateRequest, ResumeDetail

router = APIRouter(prefix="/resumes", tags=["resumes"])


async def _get_owned_resume(
    resume_id: int, user: User, db: AsyncSession
) -> Resume:
    """按 id 取当前用户的简历；不存在或属于他人一律 404（不泄露存在性）。"""
    resume = await db.get(Resume, resume_id)
    if resume is None or resume.user_id != user.id:
        raise NotFoundError("简历不存在")
    return resume


@router.post("", response_model=ResumeDetail, status_code=201)
async def create_resume(
    payload: ResumeCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Resume:
    parser = get_parser(payload.format)
    parsed = parser.parse(payload.content, fallback_title=payload.title or "未命名简历")
    content = sanitize_text(parsed.content)  # E10：解析后、切片前脱敏
    resume = Resume(user_id=user.id, title=parsed.title[:128], content=content)
    db.add(resume)
    await db.commit()
    await db.refresh(resume)
    # 切片 → 嵌入 → 向量入库；业务行已落库，向量化失败只告警不回滚（M4 起检索不到该简历）
    # rollback 会把同会话所有对象（含 user）置过期，先捕获日志所需的纯值
    resume_id = resume.id
    user_id = user.id
    title = resume.title
    try:
        resume.vector_ids = await ingest_resume(resume)
        await db.commit()
        # vector_ids 的 UPDATE 会置过期 server onupdate 字段（updated_at），
        # 显式刷新避免响应序列化时同步上下文懒加载（MissingGreenlet）
        await db.refresh(resume)
    except Exception:
        await db.rollback()
        # rollback 置过期后直接访问属性会在 asyncpg 下触发同步 IO（MissingGreenlet），
        # 刷新恢复 resume 供响应序列化；日志一律用上面捕获的纯值
        await db.refresh(resume)
        logger.exception("简历向量化失败 resume_id={}", resume_id)
    logger.info("简历入库 id={} user_id={} title={}", resume_id, user_id, title)
    return resume


@router.get("", response_model=list[ResumeBrief])
async def list_resumes(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Resume]:
    rows = await db.scalars(
        select(Resume).where(Resume.user_id == user.id).order_by(Resume.updated_at.desc())
    )
    return list(rows)


@router.get("/{resume_id}", response_model=ResumeDetail)
async def get_resume(
    resume_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Resume:
    return await _get_owned_resume(resume_id, user, db)


@router.delete("/{resume_id}", status_code=204)
async def delete_resume(
    resume_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    resume = await _get_owned_resume(resume_id, user, db)
    # 同步清理向量（幂等；失败不阻断业务删除，残留切片因 userId/sourceId 仍不可跨用户检索）
    try:
        await delete_resume_vectors(resume.vector_ids)
    except Exception:
        logger.exception("简历向量清理失败 resume_id={}", resume_id)
    await db.delete(resume)
    await db.commit()
    logger.info("简历删除 id={} user_id={}", resume_id, user.id)
