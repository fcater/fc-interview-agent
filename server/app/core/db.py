"""数据库引擎与会话（SQLAlchemy 2.0 async + asyncpg）。

业务表与向量表同库同实例（tech-stack §2.7）；业务表由 Alembic 管理，
向量表由 PGVector 自动建（M3）。
"""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(settings.database_url, pool_pre_ping=True)

SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI 依赖：每请求一个会话，结束后自动关闭。"""
    async with SessionLocal() as session:
        yield session
