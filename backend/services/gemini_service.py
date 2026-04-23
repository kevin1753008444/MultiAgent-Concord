import json
import logging
import asyncio
from typing import Optional
from google import genai
from google.genai import types
from backend.config import VERTEX_API_KEY, GEMINI_MODEL, GEMINI_EMBEDDING_MODEL, GEMINI_TIMEOUT, GEMINI_MAX_RETRIES
from backend.models.schemas import AgentResponse

logger = logging.getLogger(__name__)

AGENT_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "speech": {"type": "string"},
        "directed_at": {
            "type": "string",
            "enum": ["Agent_Prison", "Agent_Developer", "Agent_Town", "ALL", "NONE"]
        },
        "urgency_score": {"type": "integer"},
        "implicit_challenge_to": {
            "type": "string",
            "enum": ["Agent_Prison", "Agent_Developer", "Agent_Town", "NONE"]
        }
    },
    "required": ["speech", "directed_at", "urgency_score"]
}


class GeminiService:
    def __init__(self):
        self._client = genai.Client(vertexai=True, api_key=VERTEX_API_KEY)

    async def generate_agent_response(
        self,
        system_instruction: str,
        contents: list[dict],
        temperature: float = 1.0,
    ) -> Optional[AgentResponse]:
        """Call Vertex AI Gemini and parse structured output; returns None on failure."""
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=temperature,
            response_mime_type="application/json",
            response_schema=AGENT_RESPONSE_SCHEMA,
        )

        for attempt in range(GEMINI_MAX_RETRIES + 1):
            try:
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        self._client.models.generate_content,
                        model=GEMINI_MODEL,
                        contents=contents,
                        config=config,
                    ),
                    timeout=GEMINI_TIMEOUT
                )
                data = json.loads(response.text)
                return AgentResponse(**data)
            except asyncio.TimeoutError:
                logger.warning(f"Vertex AI timeout on attempt {attempt + 1}")
                if attempt == GEMINI_MAX_RETRIES:
                    return None
            except Exception as e:
                logger.error(f"Vertex AI error on attempt {attempt + 1}: {e}")
                if attempt == GEMINI_MAX_RETRIES:
                    return None

        return None

    async def generate_text(
        self,
        system_instruction: str,
        prompt: str,
        temperature: float = 0.7,
    ) -> Optional[str]:
        """Free-text generation — no JSON schema. Used by the moderator."""
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=temperature,
        )
        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    self._client.models.generate_content,
                    model=GEMINI_MODEL,
                    contents=[{"role": "user", "parts": [{"text": prompt}]}],
                    config=config,
                ),
                timeout=GEMINI_TIMEOUT,
            )
            return response.text.strip()
        except Exception as e:
            logger.error(f"generate_text error: {e}")
            return None

    async def get_embedding(self, text: str) -> list[float]:
        result = await asyncio.to_thread(
            self._client.models.embed_content,
            model=GEMINI_EMBEDDING_MODEL,
            contents=text,
            config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY"),
        )
        return result.embeddings[0].values

    async def get_document_embedding(self, text: str) -> list[float]:
        result = await asyncio.to_thread(
            self._client.models.embed_content,
            model=GEMINI_EMBEDDING_MODEL,
            contents=text,
            config=types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT"),
        )
        return result.embeddings[0].values
