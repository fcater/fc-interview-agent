"""FastAPI 应用入口：应用创建、中间件、路由注册、异常处理。

启动：`uv run uvicorn app.main:app --port 8000`（在 server/ 目录下，见根目录 dev.sh）
"""

import time
from contextlib import asynccontextmanager
from pathlib import Path

import asyncpg
from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from loguru import logger

from app.agents.candidate import build_candidate_graph
from app.agents.interviewer import build_interviewer_graph
from app.config import settings
from app.core.errors import register_exception_handlers
from app.core.log import setup_logging
from app.routers import auth, candidate, interviews, jds, knowledge, presets, resumes, users
from app.schemas.health import HealthResponse

setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """LangGraph 会话检查点（SqliteSaver，thread_id = 面试会话 id）随应用生命周期管理。

    检查点库路径走配置（data/ 已 gitignore）；图编译一次复用，
    节点内业务无关的 per-request 资源（如用户绑定的 RAG 检索）经 config 注入。
    """
    # SQLite 需要父目录已存在（首次运行/新环境时自动创建）
    Path(settings.checkpoint_db_path).parent.mkdir(parents=True, exist_ok=True)
    async with AsyncSqliteSaver.from_conn_string(settings.checkpoint_db_path) as checkpointer:
        app.state.checkpointer = checkpointer
        app.state.interviewer_graph = build_interviewer_graph(checkpointer)
        # 求职者图（M6）独立编译：同一 checkpointer，thread_id 各自为会话 id
        app.state.candidate_graph = build_candidate_graph(checkpointer)
        yield


app = FastAPI(
    title="AI 面试模拟 Agent API",
    description="基于「个人简历 + 目标岗位 JD」的中文模拟面试工具（面试官 / 求职者双角色）。",
    version="0.1.0",
    lifespan=lifespan,
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
app.include_router(knowledge.router, prefix="/api")  # /api/knowledge：语义检索（M3）
app.include_router(interviews.router, prefix="/api")  # /api/interviews：面试官会话（M4）
app.include_router(candidate.router, prefix="/api")  # /api/candidate：求职者练习（M6）
app.include_router(presets.router, prefix="/api")  # /api/presets：预设标准答案（M6）

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
            app_llm_mode=settings.llm_mode,
            database=None,
            detail=f"健康检查执行失败：{exc}",
        )
    return HealthResponse(
        status="ok" if db_up else "degraded",
        app_llm_mode=settings.llm_mode,
        database="up" if db_up else "down",
    )


app.include_router(health_router)  # GET /health
app.include_router(health_router, prefix="/api")  # GET /api/health
