#!/usr/bin/env bash
# 启动脚本：同时运行后端 + 前端

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# 检查 .env
if [ ! -f "$ROOT/.env" ]; then
  echo "ERROR: .env not found. Copy .env.example and fill in API keys."
  echo "  cp .env.example .env"
  exit 1
fi

# 后端
echo "Starting backend..."
cd "$ROOT"
if [ ! -d ".venv" ]; then
  python -m venv .venv
  .venv/Scripts/pip install -r backend/requirements.txt
fi

.venv/Scripts/uvicorn backend.main:app --reload --port 8000 &
BACKEND_PID=$!

# 前端
echo "Starting frontend..."
cd "$ROOT/frontend"
if [ ! -d "node_modules" ]; then
  npm install
fi
npm run dev &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo "Admin:    http://localhost:5173/admin"
echo ""
echo "Press Ctrl+C to stop both."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
