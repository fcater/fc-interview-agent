"""FastAPI 应用入口：应用创建、中间件、路由注册、异常处理。

启动：`uv run uvicorn app.main:app --port 8000`（在 server/ 目录下，见根目录 dev.sh）
"""

import time

import asyncpg
from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.config import settings
from app.core.errors import register_exception_handlers
from app.core.log import setup_logging
from app.routers import auth, jds, resumes, users
from app.schemas.health import HealthResponse

setup_logging()

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


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """请求日志：方法 / 路径 / 状态码 / 耗时。"""
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "{} {} -> {} ({:.1f}ms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


register_exception_handlers(app)

# ── 业务路由（统一 /api 前缀，与 vite / nginx 反代对齐）───────────
app.include_router(auth.router, prefix="/api")  # POST /api/auth/register、/api/auth/login
app.include_router(users.router, prefix="/api")  # GET /api/users/me（受保护）
app.include_router(resumes.router, prefix="/api")  # /api/resumes：简历 CRUD（M2）
app.include_router(jds.router, prefix="/api")  # /api/jds：JD 提取与 CRUD（M2）

# ── 健康检查 ─────────────────────────────────────────────────────────
# 同时挂载 /health（后端验收入口）与 /api/health（前端 /api 代理链路验收）。
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
