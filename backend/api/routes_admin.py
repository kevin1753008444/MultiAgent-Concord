import shutil
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from backend.config import RAG_KNOWLEDGEBASE_DIR, AGENT_KB_DIRS, AGENT_IDS
from backend.models.schemas import NegotiationPhase

router = APIRouter(prefix="/api/admin", tags=["admin"])

_orchestrator = None


def set_orchestrator(orch) -> None:
    global _orchestrator
    _orchestrator = orch


class UpdatePromptRequest(BaseModel):
    agent_id: str
    system_prompt: str

class SetPhaseRequest(BaseModel):
    phase: NegotiationPhase


# ─── Negotiation Phase ───────────────────────────────

@router.get("/phase")
async def get_phase():
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    return {
        "phase": _orchestrator.phase,
        "turn": len(_orchestrator.history),
    }

@router.post("/phase")
async def set_phase(req: SetPhaseRequest):
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    _orchestrator.set_phase(req.phase)
    return {"ok": True, "phase": _orchestrator.phase}


# ─── System Prompt 管理 ──────────────────────────────

@router.get("/agents")
async def get_agents():
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    return {
        agent_id: agent.get_system_prompt()
        for agent_id, agent in _orchestrator.agents.items()
    }


@router.put("/agents/{agent_id}")
async def update_agent_prompt(agent_id: str, req: UpdatePromptRequest):
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    if agent_id not in _orchestrator.agents:
        raise HTTPException(404, f"Agent {agent_id} not found")
    _orchestrator.update_agent_prompt(agent_id, req.system_prompt)
    return {"ok": True, "agent_id": agent_id}


# ─── RAG 知识库管理 ──────────────────────────────────

def _list_kb_files(agent_id: str) -> list[str]:
    """List .md/.txt/.pdf filenames in an agent's KB folder."""
    kb_dir = Path(RAG_KNOWLEDGEBASE_DIR) / AGENT_KB_DIRS.get(agent_id, "")
    if not kb_dir.exists():
        return []
    return sorted(
        f.name for f in kb_dir.iterdir()
        if f.suffix.lower() in (".md", ".txt", ".pdf")
    )


# NOTE: /rag/status and /rag/init must be defined BEFORE /rag/{agent_id}
# otherwise FastAPI matches "status"/"init" as the agent_id path parameter.

@router.get("/rag/status")
async def rag_status():
    """Chunk counts and document lists for all agents (from ChromaDB)."""
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    status = {}
    for agent_id in AGENT_IDS:
        sources = _orchestrator.vector_store.list_sources(agent_id)
        total = _orchestrator.vector_store.get_doc_count(agent_id)
        status[agent_id] = {"total_chunks": total, "documents": sources}
    return status


@router.post("/rag/init")
async def init_rag(force: bool = False):
    """Vectorize all KB files. Pass ?force=true to clear and re-ingest everything."""
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    result = await _orchestrator.retriever.init_all_knowledgebases(force=force)
    return {"ok": True, "result": result}


@router.post("/rag/reset")
async def reset_rag():
    """Clear all ChromaDB collections and re-ingest from the KB folder."""
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    result = await _orchestrator.retriever.init_all_knowledgebases(force=True)
    return {"ok": True, "result": result}


@router.get("/debug/prompt/{agent_id}")
async def debug_prompt(agent_id: str):
    """Return the assembled system instruction for an agent (no RAG, no history) for inspection."""
    from backend.core.prompt_assembler import assemble
    from backend.models.schemas import WeatherData
    from datetime import datetime, timezone
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    if agent_id not in _orchestrator.agents:
        raise HTTPException(404, f"Agent {agent_id} not found")
    agent = _orchestrator.agents[agent_id]
    stub_weather = WeatherData(
        condition="Clear", description="debug", temp_f=55.0, temp_c=12.8,
        humidity=50, wind_speed=0.0, local_time=datetime.now(timezone.utc),
        time_str="12:00", is_late_night=False, is_heavy_rain=False, pressure_hpa=1013,
    )
    rag_chunks = await _orchestrator._retrieve_for_agent(agent_id)
    system_instruction, _ = assemble(agent_id, agent.get_system_prompt(), stub_weather, [], rag_chunks)
    return {
        "agent_id": agent_id,
        "rag_chunk_count": len(rag_chunks),
        "system_instruction": system_instruction,
    }


@router.get("/rag/{agent_id}")
async def list_rag_documents(agent_id: str):
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    if agent_id not in AGENT_IDS:
        raise HTTPException(404, f"Agent {agent_id} not found")
    sources = _orchestrator.vector_store.list_sources(agent_id)
    total = _orchestrator.vector_store.get_doc_count(agent_id)
    return {"agent_id": agent_id, "total_chunks": total, "documents": sources}


@router.post("/rag/{agent_id}/upload")
async def upload_rag_document(agent_id: str, file: UploadFile = File(...)):
    """Save a file to the KB folder and vectorize it."""
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    if agent_id not in AGENT_IDS:
        raise HTTPException(404, f"Agent {agent_id} not found")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in (".md", ".txt", ".pdf"):
        raise HTTPException(400, f"Unsupported format: {suffix}. Use .md, .txt, or .pdf")

    kb_dir = Path(RAG_KNOWLEDGEBASE_DIR) / AGENT_KB_DIRS[agent_id]
    kb_dir.mkdir(parents=True, exist_ok=True)
    dest = kb_dir / file.filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        chunk_count = await _orchestrator.retriever.ingest_file(str(dest), agent_id)
    except Exception as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(500, f"Vectorization failed: {e}")

    return {"ok": True, "agent_id": agent_id, "filename": file.filename, "chunks": chunk_count}


@router.delete("/rag/{agent_id}/{filename}")
async def delete_rag_document(agent_id: str, filename: str):
    """Remove a file from the KB folder and delete its vectors."""
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    if agent_id not in AGENT_IDS:
        raise HTTPException(404, f"Agent {agent_id} not found")

    deleted = _orchestrator.vector_store.delete_by_source(agent_id, filename)
    kb_dir = Path(RAG_KNOWLEDGEBASE_DIR) / AGENT_KB_DIRS[agent_id]
    (kb_dir / filename).unlink(missing_ok=True)

    return {"ok": True, "agent_id": agent_id, "filename": filename, "chunks_deleted": deleted}
