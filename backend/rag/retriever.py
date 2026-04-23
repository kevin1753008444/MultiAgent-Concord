import asyncio
import logging
from pathlib import Path
from backend.rag.vector_store import VectorStore
from backend.rag.document_processor import DocumentProcessor
from backend.services.gemini_service import GeminiService
from backend.config import (
    RAG_TOP_K, RAG_SIMILARITY_THRESHOLD,
    RAG_KNOWLEDGEBASE_DIR, AGENT_KB_DIRS, AGENT_IDS,
)

# Delay between embedding API calls during ingestion (seconds).
# Prevents hitting the free-tier rate limit when vectorizing many chunks at once.
EMBED_DELAY = 1.2

logger = logging.getLogger(__name__)


class Retriever:
    def __init__(self, vector_store: VectorStore, gemini: GeminiService):
        self.store = vector_store
        self.gemini = gemini
        self.processor = DocumentProcessor()

    def retrieve_all(self, agent_id: str) -> list[str]:
        """Return every chunk in the agent's knowledge base (for full-context mode)."""
        return self.store.get_all_texts(agent_id)

    async def retrieve(self, agent_id: str, query: str, top_k: int = RAG_TOP_K) -> list[str]:
        """语义检索某 Agent 知识库中与 query 最相关的 top-k 文本"""
        if self.store.get_doc_count(agent_id) == 0:
            return []

        query_embedding = await self.gemini.get_embedding(query)

        results = self.store.query(
            agent_id=agent_id,
            query_embedding=query_embedding,
            n_results=top_k,
        )

        # cosine distance: 0 = 完全相同, 2 = 完全相反
        # threshold 过滤低相关度 chunk
        filtered = [
            r["text"] for r in results
            if r["distance"] < (1.0 - RAG_SIMILARITY_THRESHOLD)
        ]

        if not filtered:
            logger.debug(f"RAG [{agent_id}]: no chunks above threshold for query")
        else:
            logger.debug(f"RAG [{agent_id}]: returning {len(filtered)} chunks")

        return filtered

    async def ingest_file(self, file_path: str, agent_id: str) -> int:
        """处理单个文件并写入向量库，返回 chunk 数"""
        chunks = self.processor.process_file(file_path, agent_id)
        if not chunks:
            return 0

        texts = [c.text for c in chunks]
        metadatas = [{"source": c.source, "agent_id": c.agent_id} for c in chunks]

        # Get embeddings one at a time with a delay to stay under free-tier rate limits
        all_embeddings: list[list[float]] = []
        for idx, text in enumerate(texts):
            emb = await self.gemini.get_document_embedding(text)
            all_embeddings.append(emb)
            if idx < len(texts) - 1:
                await asyncio.sleep(EMBED_DELAY)

        # 生成唯一 ID：agent_id + source + chunk_index
        source = chunks[0].source
        ids = [f"{agent_id}_{source}_{i}" for i in range(len(chunks))]

        self.store.add_chunks(
            agent_id=agent_id,
            texts=texts,
            embeddings=all_embeddings,
            metadatas=metadatas,
            ids=ids,
        )

        return len(chunks)

    async def init_all_knowledgebases(self, force: bool = False) -> dict[str, int]:
        """Vectorize all KB files. If force=True, clears existing data first."""
        results: dict[str, int] = {}
        base = Path(RAG_KNOWLEDGEBASE_DIR)

        for agent_id in AGENT_IDS:
            kb_dir_name = AGENT_KB_DIRS.get(agent_id)
            if not kb_dir_name:
                continue
            kb_dir = base / kb_dir_name
            if not kb_dir.exists():
                logger.warning(f"KB dir not found: {kb_dir}")
                results[agent_id] = 0
                continue

            if force:
                self.store.clear_agent(agent_id)
                logger.info(f"{agent_id}: cleared for force re-init")
            else:
                existing = self.store.get_doc_count(agent_id)
                # Check that every KB file has at least one chunk — if not, re-ingest
                kb_files = {f.name for f in kb_dir.iterdir() if f.suffix.lower() in (".md", ".txt", ".pdf")}
                indexed_files = set(self.store.list_sources(agent_id))
                missing = kb_files - indexed_files
                if existing > 0 and not missing:
                    logger.info(f"{agent_id}: {existing} chunks, all files indexed — skipping")
                    results[agent_id] = existing
                    continue
                if missing:
                    logger.info(f"{agent_id}: missing files {missing}, re-ingesting")

            total = 0
            for f in sorted(kb_dir.iterdir()):
                if f.suffix.lower() in (".md", ".txt", ".pdf"):
                    try:
                        count = await self.ingest_file(str(f), agent_id)
                        total += count
                        logger.info(f"  {f.name}: {count} chunks")
                    except Exception as e:
                        logger.error(f"  {f.name}: failed - {e}")

            results[agent_id] = total
            logger.info(f"{agent_id}: total {total} chunks ingested")

        return results
