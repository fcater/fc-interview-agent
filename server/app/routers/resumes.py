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
    logger.info("简历入库 id={} user_id={} title={}", resume.id, user.id, resume.title)
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
    await db.delete(resume)
    await db.commit()
    logger.info("简历删除 id={} user_id={}", resume_id, user.id)
    # TODO(M3)：删除简历时同步清理 PGVector 中的切片
