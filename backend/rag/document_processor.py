import logging
from pathlib import Path
from dataclasses import dataclass
from backend.config import CHUNK_SIZE, CHUNK_OVERLAP

logger = logging.getLogger(__name__)


@dataclass
class Chunk:
    text: str
    agent_id: str
    source: str  # 原始文件名


class DocumentProcessor:
    def process_file(self, file_path: str, agent_id: str) -> list[Chunk]:
        path = Path(file_path)
        suffix = path.suffix.lower()

        if suffix == ".pdf":
            text = self._read_pdf(str(path))
        elif suffix in (".md", ".txt"):
            text = path.read_text(encoding="utf-8")
        else:
            logger.warning(f"Unsupported format: {suffix}, skipping {path.name}")
            return []

        # 乱码检测
        garbage = self._calc_garbage_ratio(text)
        if garbage > 0.20:
            logger.error(f"Garbage ratio {garbage:.1%} for {path.name}, skipping")
            return []

        chunks = self._split_into_chunks(text, agent_id, path.name)
        logger.info(f"Processed {path.name}: {len(chunks)} chunks")
        return chunks

    def _read_pdf(self, path: str) -> str:
        import pymupdf4llm
        return pymupdf4llm.to_markdown(path)

    def _calc_garbage_ratio(self, text: str) -> float:
        if not text:
            return 1.0
        # 不可打印字符（排除常见空白）的比例
        garbage_chars = sum(
            1 for c in text
            if not c.isprintable() and c not in ('\n', '\r', '\t')
        )
        return garbage_chars / len(text)

    def _split_into_chunks(self, text: str, agent_id: str, source: str) -> list[Chunk]:
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        chunks: list[Chunk] = []

        for para in paragraphs:
            if len(para) <= CHUNK_SIZE:
                chunks.append(Chunk(text=para, agent_id=agent_id, source=source))
            else:
                for i in range(0, len(para), CHUNK_SIZE - CHUNK_OVERLAP):
                    piece = para[i:i + CHUNK_SIZE]
                    if piece.strip():
                        chunks.append(Chunk(text=piece, agent_id=agent_id, source=source))

        return chunks
