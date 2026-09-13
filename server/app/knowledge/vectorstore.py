"""PGVector 向量库接入（E3/E7）。

与业务库同实例同连接串；向量表（langchain_pg_*）由 PGVector 自动建、
不走 Alembic。用户隔离靠元数据 userId + 检索强制 filter（E7），
不按用户分集合。切换向量库只需保持 VectorStore 接口（tech-stack §7-R3）。
"""

from functools import cache

from langchain_postgres import PGVector
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.llm.embeddings import get_embeddings

# 业务知识统一集合：简历（M3）与预设答案（M6，带标签）共用，靠 source 元数据区分
COLLECTION_NAME = "knowledge"


@cache
def get_vectorstore() -> PGVector:
    """进程内单例。异步引擎显式构造（asyncpg），与 app.core.db 同参。"""
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    return PGVector(
        embeddings=get_embeddings(),
        connection=engine,
        collection_name=COLLECTION_NAME,
        # 维度与 Embedding 模型锁定（E3）：换模型必须同维度或删集合重建
        embedding_length=settings.embedding_dimensions,
        use_jsonb=True,
        async_mode=True,
        # vector 扩展由 docker/init 初始化脚本创建；langchain-postgres 自建扩展的
        # 语句与 asyncpg 不兼容（多命令 prepared statement）
        create_extension=False,
    )
