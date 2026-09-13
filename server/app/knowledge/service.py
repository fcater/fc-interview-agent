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
from app.models import Resume

_SOURCE_RESUME = "resume"


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


@dataclasses.dataclass
class RetrievedChunk:
    """检索单条结果：score 为 cosine 距离（越小越相关）。"""

    content: str
    score: float
    resume_id: int
    title: str


async def search(query: str, *, user_id: int) -> list[RetrievedChunk]:
    """语义检索：多取一倍再按阈值过滤，截到 top_k（E6 配置）。"""
    fetch_k = settings.rag_top_k * 2
    pairs = await get_vectorstore().asimilarity_search_with_score(
        query,
        k=fetch_k,
        filter={"userId": str(user_id)},  # E7：强制用户隔离
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
