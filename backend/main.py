import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from backend.api.websocket import manager
from backend.api import routes_chat, routes_admin
from backend.core.orchestrator import Orchestrator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

orchestrator: Orchestrator | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global orchestrator
    orchestrator = Orchestrator(broadcast_fn=manager.broadcast)
    routes_chat.set_orchestrator(orchestrator)
    routes_admin.set_orchestrator(orchestrator)
    await orchestrator.ensure_rag_initialized()
    yield
    if orchestrator:
        await orchestrator.stop_auto_mode()


app = FastAPI(title="MCI Concord Multi-Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_chat.router)
app.include_router(routes_admin.router)


@app.get("/health")
async def health():
    return {"status": "ok", "ws_connections": manager.count}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type")

            if msg_type == "start_auto_mode":
                interval = data.get("interval_seconds", 15)
                await orchestrator.start_auto_mode(interval=interval)

            elif msg_type == "stop_auto_mode":
                await orchestrator.stop_auto_mode()

            elif msg_type == "trigger":
                force = data.get("force_speaker")
                await orchestrator.trigger_one_turn(force_speaker=force)

            elif msg_type == "user_inject":
                text = data.get("text", "").strip()
                if text:
                    await orchestrator.inject_user_message(text)

            elif msg_type == "moderator":
                await orchestrator._inject_moderator()

            elif msg_type == "reset":
                orchestrator.reset()
                await manager.broadcast({"type": "reset_ack"})

            elif msg_type == "ping":
                await ws.send_json({"type": "pong"})

    except WebSocketDisconnect:
        manager.disconnect(ws)
