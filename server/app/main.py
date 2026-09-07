"""FastAPI 应用入口：应用创建、路由注册、CORS。

启动：`uv run uvicorn app.main:app --reload`（在 server/ 目录下）
"""

import asyncpg
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.schemas.health import HealthResponse

app = FastAPI(
    title="AI 面试模拟 Agent API",
    description="基于「个人简历 + 目标岗位 JD」的中文模拟面试工具（面试官 / 求职者双角色）。",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 健康检查 ─────────────────────────────────────────────────────────
# 同时挂载 /health（后端验收入口）与 /api/health（前端 /api 代理链路验收）。
# M1 起业务路由统一挂载 /api 前缀，与 vite / nginx 反代对齐。
health_router = APIRouter(tags=["health"])


async def _ping_database() -> bool:
    """探测 PG 连通性（业务表 + 向量表同库同实例）。

    连接类失败（不可达 / 认证失败 / 超时）返回 False；其余异常向上抛，
    由 health() 归入 status="error"。
    """
    dsn = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    try:
        conn = await asyncpg.connect(dsn=dsn, timeout=2)
    except (asyncpg.PostgresError, OSError, TimeoutError):
        return False
    await conn.close()
    return True


@health_router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    try:
        db_up = await _ping_database()
    except Exception as exc:  # 健康检查自身执行异常：结构化返回 error，不抛裸 500
        return HealthResponse(
            status="error",
            app_llm_mode=settings.app_llm_mode,
            database=None,
            detail=f"健康检查执行失败：{exc}",
        )
    return HealthResponse(
        status="ok" if db_up else "degraded",
        app_llm_mode=settings.app_llm_mode,
        database="up" if db_up else "down",
    )


app.include_router(health_router)  # GET /health
app.include_router(health_router, prefix="/api")  # GET /api/health
