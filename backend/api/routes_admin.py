import shutil
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from backend.config import RAG_KNOWLEDGEBASE_DIR, AGENT_KB_DIRS, AGENT_IDS

router = APIRouter(prefix="/api/admin", tags=["admin"])

_orchestrator = None


def set_orchestrator(orch) -> None:
    global _orchestrator
    _orchestrator = orch


class UpdatePromptRequest(BaseModel):
    agent_id: str
    system_prompt: str


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

@router.get("/rag/{agent_id}")
async def list_rag_documents(agent_id: str):
    """列出某 Agent 知识库中的所有文件及 chunk 数"""
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    if agent_id not in AGENT_IDS:
        raise HTTPException(404, f"Agent {agent_id} not found")

    sources = _orchestrator.vector_store.list_sources(agent_id)
    total = _orchestrator.vector_store.get_doc_count(agent_id)
    return {
        "agent_id": agent_id,
        "total_chunks": total,
        "documents": sources,
    }


@router.post("/rag/{agent_id}/upload")
async def upload_rag_document(
    agent_id: str,
    file: UploadFile = File(...),
):
    """上传文件到某 Agent 的知识库并向量化"""
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    if agent_id not in AGENT_IDS:
        raise HTTPException(404, f"Agent {agent_id} not found")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in (".md", ".txt", ".pdf"):
        raise HTTPException(400, f"Unsupported format: {suffix}. Use .md, .txt, or .pdf")

    # 保存文件到知识库目录
    kb_dir = Path(RAG_KNOWLEDGEBASE_DIR) / AGENT_KB_DIRS[agent_id]
    kb_dir.mkdir(parents=True, exist_ok=True)
    dest = kb_dir / file.filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # 向量化
    try:
        chunk_count = await _orchestrator.retriever.ingest_file(str(dest), agent_id)
    except Exception as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(500, f"Vectorization failed: {e}")

    return {
        "ok": True,
        "agent_id": agent_id,
        "filename": file.filename,
        "chunks": chunk_count,
    }


@router.delete("/rag/{agent_id}/{filename}")
async def delete_rag_document(agent_id: str, filename: str):
    """删除某 Agent 知识库中的指定文件及其向量"""
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    if agent_id not in AGENT_IDS:
        raise HTTPException(404, f"Agent {agent_id} not found")

    # 从向量库删除
    deleted = _orchestrator.vector_store.delete_by_source(agent_id, filename)

    # 从磁盘删除
    kb_dir = Path(RAG_KNOWLEDGEBASE_DIR) / AGENT_KB_DIRS[agent_id]
    file_path = kb_dir / filename
    file_path.unlink(missing_ok=True)

    return {"ok": True, "agent_id": agent_id, "filename": filename, "chunks_deleted": deleted}


@router.post("/rag/init")
async def init_rag():
    """批量向量化所有现有知识库文件"""
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    result = await _orchestrator.retriever.init_all_knowledgebases()
    return {"ok": True, "result": result}


@router.get("/rag/status")
async def rag_status():
    """查看所有 Agent 的 RAG 状态"""
    if not _orchestrator:
        raise HTTPException(503, "Orchestrator not ready")
    status = {}
    for agent_id in AGENT_IDS:
        sources = _orchestrator.vector_store.list_sources(agent_id)
        total = _orchestrator.vector_store.get_doc_count(agent_id)
        status[agent_id] = {"total_chunks": total, "documents": sources}
    return status
