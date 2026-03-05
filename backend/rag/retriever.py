import logging
from pathlib import Path
from backend.rag.vector_store import VectorStore
from backend.rag.document_processor import DocumentProcessor
from backend.services.gemini_service import GeminiService
from backend.config import (
    RAG_TOP_K, RAG_SIMILARITY_THRESHOLD,
    RAG_KNOWLEDGEBASE_DIR, AGENT_KB_DIRS, AGENT_IDS,
)

logger = logging.getLogger(__name__)


class Retriever:
    def __init__(self, vector_store: VectorStore, gemini: GeminiService):
        self.store = vector_store
        self.gemini = gemini
        self.processor = DocumentProcessor()

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

        # 批量获取 embedding（每批最多 100 条避免 API 限制）
        all_embeddings: list[list[float]] = []
        batch_size = 100
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            embeddings = []
            for text in batch:
                emb = await self.gemini.get_document_embedding(text)
                embeddings.append(emb)
            all_embeddings.extend(embeddings)

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

    async def init_all_knowledgebases(self) -> dict[str, int]:
        """批量向量化所有现有知识库文件，返回 {agent_id: chunk_count}"""
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

            # 跳过已有数据的 agent（避免重复向量化）
            existing = self.store.get_doc_count(agent_id)
            if existing > 0:
                logger.info(f"{agent_id}: already has {existing} chunks, skipping init")
                results[agent_id] = existing
                continue

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
