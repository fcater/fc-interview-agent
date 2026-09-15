"""预设标准答案路由（M6，E6）：CRUD + 向量同步。

写操作后同步重建该条的向量（删除旧 ids → 重新嵌入问题文本）；
嵌入失败不阻塞业务落库（日志告警，vector_ids 留空，更新时重试可修复）。
"""


from fastapi import APIRouter, Depends
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.db import get_db
from app.core.exceptions import NotFoundError
from app.knowledge import service as knowledge_service
from app.models import PresetAnswer, User
from app.schemas.preset import PresetBrief, PresetUpsertRequest

router = APIRouter(prefix="/presets", tags=["presets"])


def _clean_tags(tags: list[str]) -> list[str]:
    """标签规整：去空白/去空/去重（保序）。"""
    seen: set[str] = set()
    cleaned: list[str] = []
    for tag in tags:
        t = tag.strip()
        if t and t not in seen:
            seen.add(t)
            cleaned.append(t)
    return cleaned


async def _owned_preset(
    preset_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PresetAnswer:
    """归属校验依赖：不存在/他人的一律 404（E7）。"""
    row = await db.get(PresetAnswer, preset_id)
    if row is None or row.user_id != user.id:
        raise NotFoundError("预设答案不存在")
    return row


async def _sync_vectors(preset: PresetAnswer, db: AsyncSession) -> None:
    """重建该预设的向量（先删后嵌）；失败仅告警，业务行保持已提交状态。"""
    await knowledge_service.delete_preset_vectors(preset.vector_ids)
    try:
        preset.vector_ids = await knowledge_service.ingest_preset_answer(preset)
    except Exception:
        logger.exception("预设答案向量同步失败 preset_id={}（更新预设可重试）", preset.id)
        preset.vector_ids = None
    await db.commit()
    await db.refresh(preset)


@router.get("", response_model=list[PresetBrief])
async def list_presets(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PresetBrief]:
    """当前用户的预设答案列表（时间倒序）。"""
    rows = (
        await db.scalars(
            select(PresetAnswer)
            .where(PresetAnswer.user_id == user.id)
            .order_by(PresetAnswer.created_at.desc())
        )
    ).all()
    return [PresetBrief.model_validate(r) for r in rows]


@router.post("", response_model=PresetBrief, status_code=201)
async def create_preset(
    payload: PresetUpsertRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PresetBrief:
    """新建预设答案并向量化。"""
    preset = PresetAnswer(
        user_id=user.id,
        question=payload.question.strip(),
        answer=payload.answer.strip(),
        tags=_clean_tags(payload.tags),
    )
    db.add(preset)
    await db.commit()
    await db.refresh(preset)
    await _sync_vectors(preset, db)
    return PresetBrief.model_validate(preset)


@router.put("/{preset_id}", response_model=PresetBrief)
async def update_preset(
    payload: PresetUpsertRequest,
    preset: PresetAnswer = Depends(_owned_preset),
    db: AsyncSession = Depends(get_db),
) -> PresetBrief:
    """更新预设答案（内容变化即重建向量）。"""
    preset.question = payload.question.strip()
    preset.answer = payload.answer.strip()
    preset.tags = _clean_tags(payload.tags)
    await db.commit()
    await db.refresh(preset)
    await _sync_vectors(preset, db)
    return PresetBrief.model_validate(preset)


@router.delete("/{preset_id}", status_code=204)
async def delete_preset(
    preset: PresetAnswer = Depends(_owned_preset),
    db: AsyncSession = Depends(get_db),
) -> None:
    """删除预设答案并清理其向量。"""
    await knowledge_service.delete_preset_vectors(preset.vector_ids)
    await db.delete(preset)
    await db.commit()
