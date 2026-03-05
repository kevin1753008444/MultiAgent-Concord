import asyncio
import logging
from datetime import datetime, timezone
from typing import Callable, Awaitable

from backend.agents.base_agent import BaseAgent
from backend.agents.agent_prison import AgentPrison
from backend.agents.agent_developer import AgentDeveloper
from backend.agents.agent_town import AgentTown
from backend.core.routing_engine import RoutingEngine
from backend.services.gemini_service import GeminiService
from backend.services.weather_service import WeatherService
from backend.core.stance_guard import StanceGuard
from backend.rag.vector_store import VectorStore
from backend.rag.retriever import Retriever
from backend.models.schemas import AgentResponse, Message, WeatherData
from backend.config import SILENCE_FALLBACK, AUTO_MODE_INTERVAL, DEBUG

logger = logging.getLogger(__name__)

BroadcastFn = Callable[[dict], Awaitable[None]]


class Orchestrator:
    def __init__(self, broadcast_fn: BroadcastFn):
        self.broadcast = broadcast_fn
        self.gemini = GeminiService()
        self.weather_svc = WeatherService()
        self.guard = StanceGuard()
        self.router = RoutingEngine()

        # RAG 组件
        self.vector_store = VectorStore()
        self.retriever = Retriever(self.vector_store, self.gemini)

        self.agents: dict[str, BaseAgent] = {
            "Agent_Prison": AgentPrison(self.gemini, self.guard),
            "Agent_Developer": AgentDeveloper(self.gemini, self.guard),
            "Agent_Town": AgentTown(self.gemini, self.guard),
        }

        self.session_id: str = "default"
        self.history: list[Message] = []
        self.speaker_history: list[str] = []
        self._auto_task: asyncio.Task | None = None
        self._last_speaker: str = "Agent_Developer"
        self._rag_initialized: bool = False

    # ─── Public API ───────────────────────────────────────────────

    async def ensure_rag_initialized(self) -> dict[str, int]:
        """首次调用时自动向量化现有知识库文件"""
        if self._rag_initialized:
            return {}
        self._rag_initialized = True
        logger.info("Initializing RAG knowledgebases...")
        result = await self.retriever.init_all_knowledgebases()
        logger.info(f"RAG init complete: {result}")
        return result

    async def trigger_one_turn(self, force_speaker: str | None = None) -> None:
        """触发一轮对话"""
        # 确保 RAG 已初始化
        await self.ensure_rag_initialized()

        weather = await self.weather_svc.get_current_weather()
        await self.broadcast({"type": "weather_update", "data": weather.model_dump(mode="json")})

        # 决定发言者
        if force_speaker:
            next_speaker = force_speaker
            weights = {}
        elif not self.speaker_history:
            next_speaker = "Agent_Developer"
            weights = {}
        else:
            last_msg = self.history[-1] if self.history else None
            if last_msg and last_msg.directed_at is not None:
                fake_response = AgentResponse(
                    speech=last_msg.speech,
                    directed_at=last_msg.directed_at,  # type: ignore
                    emotional_state=last_msg.emotional_state or "CALCULATING",  # type: ignore
                    urgency_score=last_msg.urgency_score or 5,
                    implicit_challenge_to=None,
                )
                next_speaker, weights = self.router.get_next_speaker(
                    last_response=fake_response,
                    last_speaker=self._last_speaker,
                    speaker_history=self.speaker_history,
                    weather_is_late_night=weather.is_late_night,
                    weather_is_heavy_rain=weather.is_heavy_rain,
                )
            else:
                all_agents = ["Agent_Prison", "Agent_Developer", "Agent_Town"]
                idx = (all_agents.index(self._last_speaker) + 1) % 3
                next_speaker = all_agents[idx]
                weights = {}

        agent = self.agents[next_speaker]
        await self.broadcast({"type": "agent_thinking", "agent_id": next_speaker})

        # RAG 检索：用最近 3 条对话作为 query
        rag_chunks = await self._retrieve_for_agent(next_speaker)

        response = await agent.speak(
            history=self.history,
            weather=weather,
            rag_chunks=rag_chunks,
        )

        if response is None:
            await self._broadcast_silence(next_speaker, weather)
            return

        if DEBUG and weights:
            await self.broadcast({
                "type": "routing_debug",
                "weights": weights,
                "selected": next_speaker,
            })

        msg = Message(
            session_id=self.session_id,
            sender=next_speaker,
            speech=response.speech,
            directed_at=response.directed_at,
            emotional_state=response.emotional_state,
            urgency_score=response.urgency_score,
            weather_snapshot=weather.to_prompt_dict(),
        )
        self.history.append(msg)
        self.speaker_history.append(next_speaker)
        if len(self.speaker_history) > 20:
            self.speaker_history = self.speaker_history[-20:]

        self._last_speaker = next_speaker

        await self.broadcast({
            "type": "agent_message",
            "agent_id": next_speaker,
            "speech": response.speech,
            "directed_at": response.directed_at,
            "emotional_state": response.emotional_state,
            "urgency_score": response.urgency_score,
            "implicit_challenge_to": response.implicit_challenge_to,
            "weather_snapshot": {
                "condition": weather.condition,
                "temp_f": weather.temp_f,
                "time_str": weather.time_str,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    async def start_auto_mode(self, interval: int = AUTO_MODE_INTERVAL) -> None:
        if self._auto_task and not self._auto_task.done():
            return
        self._auto_task = asyncio.create_task(self._auto_loop(interval))

    async def stop_auto_mode(self) -> None:
        if self._auto_task:
            self._auto_task.cancel()
            self._auto_task = None

    def update_agent_prompt(self, agent_id: str, prompt: str) -> None:
        if agent_id in self.agents:
            self.agents[agent_id].set_system_prompt(prompt)

    def reset(self) -> None:
        self.history.clear()
        self.speaker_history.clear()
        self._last_speaker = "Agent_Developer"

    # ─── Internal ─────────────────────────────────────────────────

    async def _retrieve_for_agent(self, agent_id: str) -> list[str]:
        """用最近对话构建 query，检索该 Agent 的知识库"""
        if not self.history:
            # 无历史时，用 Agent 名称作为初始 query
            query = f"{agent_id} opening statement MCI Concord"
        else:
            recent = self.history[-3:]
            query = " ".join(m.speech for m in recent)
            # 截断避免 embedding 输入过长
            if len(query) > 1000:
                query = query[:1000]

        try:
            return await self.retriever.retrieve(agent_id, query)
        except Exception as e:
            logger.warning(f"RAG retrieve failed for {agent_id}: {e}")
            return []

    async def _auto_loop(self, interval: int) -> None:
        try:
            while True:
                await self.trigger_one_turn()
                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            logger.info("Auto mode stopped")

    async def _broadcast_silence(self, agent_id: str, weather: WeatherData) -> None:
        await self.broadcast({
            "type": "agent_message",
            "agent_id": agent_id,
            "speech": SILENCE_FALLBACK,
            "directed_at": "NONE",
            "emotional_state": "DISMISSIVE",
            "urgency_score": 1,
            "implicit_challenge_to": None,
            "weather_snapshot": {
                "condition": weather.condition,
                "temp_f": weather.temp_f,
                "time_str": weather.time_str,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
