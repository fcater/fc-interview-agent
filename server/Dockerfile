# ── 阶段 1：依赖构建（uv.lock 锁定版本，--frozen 保证可复现） ──────────────
# uv 官方镜像基于 python:3.12-slim-bookworm，解释器路径与运行阶段一致，
# .venv 可直接搬运（tech-stack §4.5：uv 构建 → slim 镜像）
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

WORKDIR /app
# copy 模式兼容非 BuildKit 场景；依赖层仅随 lock 文件变化，充分利用构建缓存。
# 项目本身不安装进 venv（--no-install-project），源码在运行阶段直接 COPY（PYTHONPATH 导入）
ENV UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# ── 阶段 2：运行镜像（slim，仅 .venv + 源码，非 root 运行） ────────────────
FROM python:3.12-slim-bookworm

# PYTHONPATH=/app：uvicorn 与 alembic 均以 /app 为工作目录导入 app 包；
# 项目本身不装进 venv（--no-install-project），源码即运行代码
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH=/app \
    PYTHONUNBUFFERED=1

WORKDIR /app
RUN groupadd -r appuser && useradd -r -g appuser appuser \
    && mkdir -p /app/data && chown -R appuser:appuser /app

COPY --from=builder --chown=appuser:appuser /app/.venv /app/.venv
COPY --chown=appuser:appuser app ./app
COPY --chown=appuser:appuser migrations ./migrations
COPY --chown=appuser:appuser scripts ./scripts
COPY --chown=appuser:appuser alembic.ini ./alembic.ini

USER appuser
EXPOSE 8000

# 启动前自动执行业务表迁移（幂等）；向量表由 PGVector 自动建
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
