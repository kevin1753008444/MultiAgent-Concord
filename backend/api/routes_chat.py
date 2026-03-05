from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/chat", tags=["chat"])

# orchestrator 会在 main.py 中注入
_orchestrator = None


def set_orchestrator(orch) -> None:
    global _orchestrator
    _orchestrator = orch


class TriggerRequest(BaseModel):
    force_speaker: Optional[str] = None


class AutoModeRequest(BaseModel):
    interval_seconds: int = 15


@router.post("/trigger")
async def trigger_turn(req: TriggerRequest):
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    await _orchestrator.trigger_one_turn(force_speaker=req.force_speaker)
    return {"ok": True}


@router.post("/auto/start")
async def start_auto(req: AutoModeRequest):
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    await _orchestrator.start_auto_mode(interval=req.interval_seconds)
    return {"ok": True, "interval": req.interval_seconds}


@router.post("/auto/stop")
async def stop_auto():
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    await _orchestrator.stop_auto_mode()
    return {"ok": True}


@router.post("/reset")
async def reset_conversation():
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    _orchestrator.reset()
    return {"ok": True}


@router.get("/history")
async def get_history():
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    return [msg.model_dump() for msg in _orchestrator.history]
