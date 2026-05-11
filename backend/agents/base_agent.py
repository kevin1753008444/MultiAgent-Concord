import logging
from pathlib import Path
from backend.models.schemas import AgentResponse, WeatherData, Message
from backend.services.gemini_service import GeminiService
from backend.core.prompt_assembler import assemble
from backend.core.stance_guard import StanceGuard
from backend.config import GEMINI_MAX_RETRIES, SILENCE_FALLBACK, KNOWLEDGEBASE_PATH

logger = logging.getLogger(__name__)


class BaseAgent:
    agent_id: str
    system_prompt_file: str
    temperature: float = 1.0

    def __init__(self, gemini: GeminiService, guard: StanceGuard):
        self.gemini = gemini
        self.guard = guard
        self._system_prompt: str | None = None

    def get_system_prompt(self) -> str:
        # If manually set via admin panel, use that
        if self._system_prompt is not None:
            return self._system_prompt
        # Otherwise read from disk every time so file edits take effect immediately
        path = Path(KNOWLEDGEBASE_PATH) / self.system_prompt_file
        if path.exists():
            return path.read_text(encoding="utf-8")
        logger.warning(f"System prompt file not found: {path}")
        return f"You are {self.agent_id}. Maintain your role."

    def set_system_prompt(self, prompt: str) -> None:
        """Admin 面板更新时调用"""
        self._system_prompt = prompt

    async def speak(
        self,
        history: list[Message],
        weather: WeatherData,
        rag_chunks: list[str] | None = None,
    ) -> AgentResponse | None:
        """
        生成一条发言，含立场验证和重试逻辑。
        返回 None 表示所有尝试均失败，应插入沉默占位符。
        """
        system_prompt = self.get_system_prompt()
        chunks = rag_chunks or []
        extra_instruction = ""

        for attempt in range(GEMINI_MAX_RETRIES + 1):
            sp = system_prompt
            if extra_instruction:
                sp = system_prompt + f"\n\n{extra_instruction}"

            system_instruction, contents = assemble(
                agent_id=self.agent_id,
                system_prompt=sp,
                weather=weather,
                history=history,
                rag_chunks=chunks,
            )

            # 立场违规时提高 temperature
            temp = self.temperature + (attempt * 0.15)

            response = await self.gemini.generate_agent_response(
                system_instruction=system_instruction,
                contents=contents,
                temperature=temp,
            )

            if response is None:
                logger.warning(f"{self.agent_id} attempt {attempt + 1}: API returned None")
                continue

            if self.guard.validate(response, self.agent_id):
                return response

            logger.warning(f"{self.agent_id} attempt {attempt + 1}: stance violation, retrying")
            extra_instruction = self.guard.get_retry_instruction(self.agent_id)

        logger.error(f"{self.agent_id}: all attempts failed")
        return None
