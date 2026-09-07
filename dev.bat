@echo off
rem ============================================================
rem  fc-interview-agent dev launcher (Windows)
rem  Starts backend (:8000, OpenAPI at /docs) and frontend (:5173)
rem  in two separate console windows, one per server.
rem
rem  Backend : http://localhost:8000  (Postman targets this port)
rem  Frontend: http://localhost:5173  (browser; /api proxies to backend)
rem
rem  Prereqs: native PostgreSQL with fc_interview database
rem           (see README "本地启动"); uv sync / pnpm install once.
rem ============================================================

echo [1/2] Starting backend (uvicorn http://localhost:8000)
start "fc-interview-server" cmd /k "cd /d %~dp0server && uv run uvicorn app.main:app --port 8000"

echo [2/2] Starting frontend (vite http://localhost:5173)
start "fc-interview-client" cmd /k "cd /d %~dp0client && pnpm dev"

echo.
echo Two windows started. Close each window to stop a server.
