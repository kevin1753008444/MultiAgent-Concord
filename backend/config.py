import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent.parent

load_dotenv(BASE_DIR / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")

# ElevenLabs voice IDs per agent
# Prison  → Adam  (deep, worn)
# Developer → Arnold (crisp, authoritative)
# Town    → Thomas (measured, calm)
ELEVENLABS_VOICES: dict[str, str] = {
    "Agent_Prison":    "CwhRBWXzGAHq8TQ4Fs17",  # Roger
    "Agent_Developer": "IKne3meq5aSn9XLyUdCD", #Charlie
    "Agent_Town":      "cgSgspJ2msm6clMCkdW9", # Jessica
}

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR}/data/concord.db")
CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", str(BASE_DIR / "data" / "chroma_db"))
KNOWLEDGEBASE_PATH = os.getenv("KNOWLEDGEBASE_PATH", str(BASE_DIR))

MAX_CONSECUTIVE_SPEAKS = int(os.getenv("MAX_CONSECUTIVE_SPEAKS", "2"))
AUTO_MODE_INTERVAL = int(os.getenv("AUTO_MODE_INTERVAL", "15"))
GEMINI_TIMEOUT = int(os.getenv("GEMINI_TIMEOUT", "15"))
GEMINI_MAX_RETRIES = int(os.getenv("GEMINI_MAX_RETRIES", "2"))

RAG_TOP_K = int(os.getenv("RAG_TOP_K", "3"))
RAG_SIMILARITY_THRESHOLD = float(os.getenv("RAG_SIMILARITY_THRESHOLD", "0.5"))
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "512"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "64"))

DEBUG = os.getenv("DEBUG", "false").lower() == "true"

AGENT_IDS = ["Agent_Prison", "Agent_Developer", "Agent_Town"]

# Agent ID → 知识库目录名 映射
AGENT_KB_DIRS: dict[str, str] = {
    "Agent_Prison": "AgentPrison_knowledgebase",
    "Agent_Developer": "AgentDeveloper_knowledgebase",
    "Agent_Town": "AgentTown_knowledgebase",
}

RAG_KNOWLEDGEBASE_DIR = os.getenv(
    "RAG_KNOWLEDGEBASE_DIR",
    str(BASE_DIR / "RAGKnowledgebase")
)

BOSTON_COORDS = {"lat": 42.3601, "lon": -71.0589}
WEATHER_CACHE_TTL = 300  # 5 minutes
WEATHER_ENABLED = os.getenv("WEATHER_ENABLED", "false").lower() == "true"

GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_EMBEDDING_MODEL = "models/gemini-embedding-001"

SILENCE_FALLBACK = "[天空一阵沉寂，时间暂时凝固。]"

# When True, routing uses equal weights (bypasses emotional/weather modifiers).
# Ensures all agents — especially Prison — get regular turns.
RANDOM_ROUTING = os.getenv("RANDOM_ROUTING", "true").lower() == "true"
