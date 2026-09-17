#!/usr/bin/env sh
# ============================================================
#  fc-interview-agent dev launcher (POSIX)
#  Starts backend (:8200, OpenAPI at /docs) and frontend (:5173)
#  in one terminal; Ctrl+C stops both.
#
#  Backend : http://localhost:8200  (Postman targets this port)
#  Frontend: http://localhost:5173  (browser; /api proxies to backend)
#
#  Works on Linux / macOS / Windows (Git Bash or WSL) —
#  same POSIX environment as the Docker images, no host-OS specifics.
#
#  Prereqs: Docker 起开发数据库（pgvector 容器，非本机安装）：
#             docker compose up -d postgres   # 首次自动建库 fc_interview + vector 扩展
#           uv sync / pnpm install once; APP_LLM_MODE=local 时需 Ollama 在跑。
#           （详见 README "本地启动"）
# ============================================================
set -u

cd "$(dirname "$0")"

# ── 预检：开发数据库必须已就绪 ──────────────────────────────────
# 数据库跑在 Docker 里（非本机安装）。容器没起时后端照样能启动，但所有接口
# 都会在查询时报错，报错链路长、现场难定位——这里提前拦下，直接说要做什么。
if ! command -v docker >/dev/null 2>&1; then
    echo "✗ 未找到 docker 命令。" >&2
    echo "  本项目的开发数据库 = Docker 里的 pgvector 容器（不需本机安装 PostgreSQL）。" >&2
    echo "  请先安装 Docker Desktop，详见 README「本地启动」。" >&2
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo "✗ Docker 守护进程未运行。" >&2
    echo "  请先启动 Docker Desktop，等托盘图标就绪后重试。" >&2
    exit 1
fi

# ps 默认只列运行中的容器，为空即未运行（或用的是别的项目目录）
if [ -z "$(docker compose ps -q postgres 2>/dev/null)" ]; then
    echo "✗ 数据库容器 postgres 未运行（后端此时能起，但接口会全部报错）。" >&2
    echo "  请执行：docker compose up -d postgres" >&2
    exit 1
fi

echo "[0/2] 数据库预检通过（postgres 容器运行中，宿主机端口 5433）"
echo "[1/2] Starting backend (uvicorn http://localhost:8200)"
(cd server && exec uv run uvicorn app.main:app --port 8200) &
SERVER_PID=$!

echo "[2/2] Starting frontend (vite http://localhost:5173)"
(cd client && exec pnpm dev) &
CLIENT_PID=$!

echo
echo "Backend  -> http://localhost:8200  (/docs = OpenAPI)"
echo "Frontend -> http://localhost:5173"
echo "Press Ctrl+C to stop both servers."
echo

cleanup() {
    kill "$SERVER_PID" "$CLIENT_PID" 2>/dev/null
    wait "$SERVER_PID" "$CLIENT_PID" 2>/dev/null
}
trap cleanup INT TERM EXIT

wait
