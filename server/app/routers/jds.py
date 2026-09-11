"""JD 路由：提取（不落库）/ 保存 / 列表 / 详情 / 删除（用户隔离）。"""

from fastapi import APIRouter, Depends
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.db import get_db
from app.core.exceptions import NotFoundError
from app.models import JD, User
from app.schemas.jd import (
    JDBrief,
    JDCreateRequest,
    JDDetail,
    JDExtractRequest,
    JDExtractResponse,
    JDKeyPoints,
)
from app.services.jd_service import extract_key_points

router = APIRouter(prefix="/jds", tags=["jds"])


async def _get_owned_jd(jd_id: int, user: User, db: AsyncSession) -> JD:
    """按 id 取当前用户的 JD；不存在或属于他人一律 404（不泄露存在性）。"""
    jd = await db.get(JD, jd_id)
    if jd is None or jd.user_id != user.id:
        raise NotFoundError("JD 不存在")
    return jd


@router.post("/extract", response_model=JDExtractResponse)
async def extract_jd(
    payload: JDExtractRequest,
    user: User = Depends(get_current_user),
) -> JDExtractResponse:
    """粘贴 JD → 结构化关键点（预览用，不落库；保存走 POST /jds）。"""
    key_points = await extract_key_points(payload.content)
    return JDExtractResponse(key_points=key_points)


@router.post("", response_model=JDDetail, status_code=201)
async def create_jd(
    payload: JDCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JD:
    key_points: JDKeyPoints = payload.key_points or await extract_key_points(payload.content)
    jd = JD(
        user_id=user.id,
        title=payload.title,
        content=payload.content,
        key_points=key_points.model_dump(),
    )
    db.add(jd)
    await db.commit()
    await db.refresh(jd)
    logger.info("JD 入库 id={} user_id={} title={}", jd.id, user.id, jd.title)
    return jd


@router.get("", response_model=list[JDBrief])
async def list_jds(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[JD]:
    rows = await db.scalars(select(JD).where(JD.user_id == user.id).order_by(JD.created_at.desc()))
    return list(rows)


@router.get("/{jd_id}", response_model=JDDetail)
async def get_jd(
    jd_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JD:
    return await _get_owned_jd(jd_id, user, db)


@router.delete("/{jd_id}", status_code=204)
async def delete_jd(
    jd_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    jd = await _get_owned_jd(jd_id, user, db)
    await db.delete(jd)
    await db.commit()
    logger.info("JD 删除 id={} user_id={}", jd_id, user.id)
