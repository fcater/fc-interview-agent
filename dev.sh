#!/usr/bin/env sh
# ============================================================
#  fc-interview-agent dev launcher (POSIX)
#  Starts backend (:8000, OpenAPI at /docs) and frontend (:5173)
#  in one terminal; Ctrl+C stops both.
#
#  Backend : http://localhost:8000  (Postman targets this port)
#  Frontend: http://localhost:5173  (browser; /api proxies to backend)
#
#  Works on Linux / macOS / Windows (Git Bash or WSL) —
#  same POSIX environment as the Docker images, no host-OS specifics.
#
#  Prereqs: native PostgreSQL with fc_interview database
#           (see README "本地启动"); uv sync / pnpm install once.
# ============================================================
set -u

cd "$(dirname "$0")"

echo "[1/2] Starting backend (uvicorn http://localhost:8000)"
(cd server && exec uv run uvicorn app.main:app --port 8000) &
SERVER_PID=$!

echo "[2/2] Starting frontend (vite http://localhost:5173)"
(cd client && exec pnpm dev) &
CLIENT_PID=$!

echo
echo "Backend  -> http://localhost:8000  (/docs = OpenAPI)"
echo "Frontend -> http://localhost:5173"
echo "Press Ctrl+C to stop both servers."
echo

cleanup() {
    kill "$SERVER_PID" "$CLIENT_PID" 2>/dev/null
    wait "$SERVER_PID" "$CLIENT_PID" 2>/dev/null
}
trap cleanup INT TERM EXIT

wait
