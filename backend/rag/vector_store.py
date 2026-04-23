import logging
from pathlib import Path
import chromadb
from backend.config import CHROMA_DB_PATH, AGENT_IDS

logger = logging.getLogger(__name__)


class VectorStore:
    def __init__(self):
        db_path = Path(CHROMA_DB_PATH)
        db_path.mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(path=str(db_path))
        self._collections: dict[str, chromadb.Collection] = {}

        for agent_id in AGENT_IDS:
            self._collections[agent_id] = self._client.get_or_create_collection(
                name=agent_id,
                metadata={"hnsw:space": "cosine"},
            )
        logger.info(f"ChromaDB initialized at {db_path}")

    def add_chunks(
        self,
        agent_id: str,
        texts: list[str],
        embeddings: list[list[float]],
        metadatas: list[dict],
        ids: list[str],
    ) -> None:
        col = self._collections[agent_id]
        col.add(
            documents=texts,
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids,
        )
        logger.info(f"Added {len(texts)} chunks to {agent_id}")

    def query(
        self,
        agent_id: str,
        query_embedding: list[float],
        n_results: int = 3,
    ) -> list[dict]:
        """返回 [{"text": ..., "source": ..., "distance": ...}, ...]"""
        col = self._collections[agent_id]
        if col.count() == 0:
            return []

        results = col.query(
            query_embeddings=[query_embedding],
            n_results=min(n_results, col.count()),
            include=["documents", "metadatas", "distances"],
        )

        items = []
        for i in range(len(results["documents"][0])):
            items.append({
                "text": results["documents"][0][i],
                "source": results["metadatas"][0][i].get("source", ""),
                "distance": results["distances"][0][i],
            })
        return items

    def get_all_texts(self, agent_id: str) -> list[str]:
        col = self._collections[agent_id]
        if col.count() == 0:
            return []
        result = col.get(include=["documents"])
        return result["documents"] or []

    def get_doc_count(self, agent_id: str) -> int:
        return self._collections[agent_id].count()

    def list_sources(self, agent_id: str) -> list[str]:
        """列出某 Agent 知识库中所有唯一文件名"""
        col = self._collections[agent_id]
        if col.count() == 0:
            return []
        all_meta = col.get(include=["metadatas"])
        sources = set()
        for m in all_meta["metadatas"]:
            if "source" in m:
                sources.add(m["source"])
        return sorted(sources)

    def delete_by_source(self, agent_id: str, source: str) -> int:
        """删除某 Agent 知识库中指定来源文件的所有 chunk"""
        col = self._collections[agent_id]
        all_data = col.get(include=["metadatas"])
        ids_to_delete = [
            all_data["ids"][i]
            for i, m in enumerate(all_data["metadatas"])
            if m.get("source") == source
        ]
        if ids_to_delete:
            col.delete(ids=ids_to_delete)
        logger.info(f"Deleted {len(ids_to_delete)} chunks from {agent_id} source={source}")
        return len(ids_to_delete)

    def clear_agent(self, agent_id: str) -> None:
        """清空某 Agent 的整个 collection"""
        self._client.delete_collection(agent_id)
        self._collections[agent_id] = self._client.get_or_create_collection(
            name=agent_id,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info(f"Cleared collection {agent_id}")
