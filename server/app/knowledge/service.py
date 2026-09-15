"""知识库服务：简历入库（切片→嵌入→向量）、删除清理、语义检索（E6/E7）。

检索结果一律带 user_id 过滤（E7 隔离兜底的向量侧）；阈值与 topK
读 config（E6）。score 语义为 cosine 距离（越小越相关），
rag_similarity_threshold 为距离上限。
"""

import dataclasses

from loguru import logger

from app.config import settings
from app.knowledge.splitting import build_text_splitter
from app.knowledge.vectorstore import get_vectorstore
from app.models import PresetAnswer, Resume

_SOURCE_RESUME = "resume"
_SOURCE_PRESET = "preset"


def _resume_metadata(resume: Resume) -> dict:
    """切片元数据：userId 供隔离过滤，sourceId 供溯源，title 供展示。"""
    return {
        "userId": str(resume.user_id),
        "sourceId": str(resume.id),
        "source": _SOURCE_RESUME,
        "title": resume.title,
    }


async def ingest_resume(resume: Resume) -> list[str]:
    """切片并写入向量库，返回向量 id 列表（由业务表持久化，删除时用）。"""
    texts = build_text_splitter().split_text(resume.content)
    if not texts:
        return []
    meta = _resume_metadata(resume)
    ids = await get_vectorstore().aadd_texts(
        texts,
        metadatas=[meta] * len(texts),
    )
    logger.info(
        "简历切片入库 resume_id={} chunks={} vector_ids={}", resume.id, len(texts), len(ids)
    )
    return ids


async def delete_resume_vectors(chunk_ids: list[str] | None) -> None:
    """按持久化的向量 id 清理切片；无记录时静默跳过（幂等）。"""
    if not chunk_ids:
        return
    await get_vectorstore().adelete(ids=chunk_ids, collection_only=True)
    logger.info("简历向量清理完成 count={}", len(chunk_ids))


# ── 预设标准答案（M6，E6：标签 + 相似度阈值双重命中） ───────────────


def _preset_metadata(preset: PresetAnswer) -> dict:
    """预设答案元数据：answer/tags 随向量存储（命中后免回表直接取用）。"""
    return {
        "userId": str(preset.user_id),
        "sourceId": str(preset.id),
        "source": _SOURCE_PRESET,
        "question": preset.question,
        "answer": preset.answer,
        "tags": preset.tags,
    }


async def ingest_preset_answer(preset: PresetAnswer) -> list[str]:
    """预设答案入库：只嵌入 question 文本（与用户提问做相似度匹配）。

    返回向量 id 列表（业务表持久化，更新/删除时用）。metadata 值类型
    经 langchain-postgres 校验异常时降级：tags 退化为逗号串重试一次。
    """
    meta = _preset_metadata(preset)
    try:
        ids = await get_vectorstore().aadd_texts([preset.question], metadatas=[meta])
    except Exception:
        # 个别版本对 list 类型 metadata 值校验严格：降级为分隔串重试
        logger.warning("预设答案向量入库带 list tags 失败，降级字符串重试 id={}", preset.id)
        meta["tags"] = "、".join(preset.tags)
        ids = await get_vectorstore().aadd_texts([preset.question], metadatas=[meta])
    logger.info("预设答案向量入库 preset_id={} vector_ids={}", preset.id, ids)
    return ids


async def delete_preset_vectors(chunk_ids: list[str] | None) -> None:
    """按持久化的向量 id 清理预设答案向量（幂等）。"""
    if not chunk_ids:
        return
    await get_vectorstore().adelete(ids=chunk_ids, collection_only=True)
    logger.info("预设答案向量清理完成 count={}", len(chunk_ids))


@dataclasses.dataclass
class PresetHit:
    """预设答案命中结果：answer 为标准答案全文，score 为 cosine 距离。"""

    preset_id: int
    question: str
    answer: str
    score: float
    tags: list[str]


def _preset_tags(meta: dict) -> list[str]:
    """从向量 metadata 还原标签列表（兼容 ingest 时的分隔串降级）。"""
    raw = meta.get("tags") or []
    if isinstance(raw, str):
        return [t for t in raw.replace(",", "、").split("、") if t]
    return [str(t) for t in raw]


async def search_presets(query: str, *, user_id: int) -> PresetHit | None:
    """预设答案匹配：双重命中（距离 ≤ 阈值 且 标签子串命中提问）取 top1。

    标签规则：预设无标签时仅按相似度判定；有标签时任一标签出现在
    提问文本（不区分大小写）才认定命中——标签是用户声明的适用范围，
    防止语义相近但场景不同的提问误触发（E6 可调）。
    """
    pairs = await get_vectorstore().asimilarity_search_with_score(
        query,
        k=settings.preset_top_k * 2,
        filter={"userId": str(user_id), "source": _SOURCE_PRESET},  # E7 + source 隔离
    )
    lowered = query.lower()
    for doc, score in pairs:
        if score > settings.preset_similarity_threshold:
            continue
        tags = _preset_tags(doc.metadata)
        if tags and not any(tag.lower() in lowered for tag in tags):
            continue
        return PresetHit(
            preset_id=int(doc.metadata.get("sourceId", 0)),
            question=doc.metadata.get("question", doc.page_content),
            answer=doc.metadata.get("answer", ""),
            score=score,
            tags=tags,
        )
    return None


@dataclasses.dataclass
class RetrievedChunk:
    """检索单条结果：score 为 cosine 距离（越小越相关）。"""

    content: str
    score: float
    resume_id: int
    title: str


async def search(query: str, *, user_id: int) -> list[RetrievedChunk]:
    """语义检索：多取一倍再按阈值过滤，截到 top_k（E6 配置）。

    filter 同时按 userId 与 source 过滤（多键 AND）：M6 起预设答案
    与简历切片同集合，不带 source 会把标准答案误当简历上下文。
    """
    fetch_k = settings.rag_top_k * 2
    pairs = await get_vectorstore().asimilarity_search_with_score(
        query,
        k=fetch_k,
        filter={"userId": str(user_id), "source": _SOURCE_RESUME},  # E7：强制用户隔离
    )
    results = [
        RetrievedChunk(
            content=doc.page_content,
            score=score,
            resume_id=int(doc.metadata.get("sourceId", 0)),
            title=doc.metadata.get("title", ""),
        )
        for doc, score in pairs
        if score <= settings.rag_similarity_threshold
    ]
    return results[: settings.rag_top_k]
