import json
import logging
import asyncio
from typing import Optional
import google.generativeai as genai
from backend.config import GEMINI_API_KEY, GEMINI_MODEL, GEMINI_TIMEOUT, GEMINI_MAX_RETRIES
from backend.models.schemas import AgentResponse

logger = logging.getLogger(__name__)

# JSON Schema 强制要求
AGENT_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "speech": {"type": "string"},
        "directed_at": {
            "type": "string",
            "enum": ["Agent_Prison", "Agent_Developer", "Agent_Town", "ALL", "NONE"]
        },
        "emotional_state": {
            "type": "string",
            "enum": ["DEFIANT", "THREATENING", "PLEADING", "CALCULATING", "NEGOTIATING", "DISMISSIVE", "ALARMED"]
        },
        "urgency_score": {"type": "integer"},
        "implicit_challenge_to": {
            "type": "string",
            "enum": ["Agent_Prison", "Agent_Developer", "Agent_Town", "NONE"]
        }
    },
    "required": ["speech", "directed_at", "emotional_state", "urgency_score"]
}


class GeminiService:
    def __init__(self):
        genai.configure(api_key=GEMINI_API_KEY)
        self._models: dict[str, genai.GenerativeModel] = {}

    def _get_model(self, temperature: float = 1.0) -> genai.GenerativeModel:
        key = str(temperature)
        if key not in self._models:
            self._models[key] = genai.GenerativeModel(
                model_name=GEMINI_MODEL,
                generation_config=genai.GenerationConfig(
                    temperature=temperature,
                    response_mime_type="application/json",
                    response_schema=AGENT_RESPONSE_SCHEMA,
                )
            )
        return self._models[key]

    async def generate_agent_response(
        self,
        system_instruction: str,
        contents: list[dict],
        temperature: float = 1.0,
    ) -> Optional[AgentResponse]:
        """调用 Gemini API 并解析结构化输出，失败时返回 None"""
        model = genai.GenerativeModel(
            model_name=GEMINI_MODEL,
            system_instruction=system_instruction,
            generation_config=genai.GenerationConfig(
                temperature=temperature,
                response_mime_type="application/json",
                response_schema=AGENT_RESPONSE_SCHEMA,
            )
        )

        for attempt in range(GEMINI_MAX_RETRIES + 1):
            try:
                response = await asyncio.wait_for(
                    asyncio.to_thread(model.generate_content, contents),
                    timeout=GEMINI_TIMEOUT
                )
                raw = response.text
                data = json.loads(raw)
                return AgentResponse(**data)
            except asyncio.TimeoutError:
                logger.warning(f"Gemini timeout on attempt {attempt + 1}")
                if attempt == GEMINI_MAX_RETRIES:
                    return None
            except Exception as e:
                logger.error(f"Gemini API error on attempt {attempt + 1}: {e}")
                if attempt == GEMINI_MAX_RETRIES:
                    return None

        return None

    async def get_embedding(self, text: str) -> list[float]:
        """获取文本嵌入向量"""
        result = await asyncio.to_thread(
            genai.embed_content,
            model="models/gemini-embedding-001",
            content=text,
            task_type="retrieval_query"
        )
        return result["embedding"]

    async def get_document_embedding(self, text: str) -> list[float]:
        """获取文档嵌入向量"""
        result = await asyncio.to_thread(
            genai.embed_content,
            model="models/gemini-embedding-001",
            content=text,
            task_type="retrieval_document"
        )
        return result["embedding"]
