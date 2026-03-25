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
from backend.services.elevenlabs_service import ElevenLabsService, log_available_voices
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
        self.tts = ElevenLabsService()
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
        """RAG disabled — skipping embedding init."""
        if self._rag_initialized:
            return {}
        self._rag_initialized = True
        await log_available_voices()
        return {}

    async def trigger_one_turn(self, force_speaker: str | None = None) -> None:
        """触发一轮对话"""
        # Weather API disabled — use a neutral stub so agents still receive the field
        weather = WeatherData(
            condition="Clear",
            description="weather disabled",
            temp_f=55.0,
            temp_c=12.8,
            humidity=50,
            wind_speed=0.0,
            local_time=datetime.now(timezone.utc),
            time_str=datetime.now(timezone.utc).strftime("%H:%M"),
            is_late_night=False,
            is_heavy_rain=False,
            pressure_hpa=1013,
        )

        # 决定发言者
        if force_speaker:
            next_speaker = force_speaker
            weights = {}
        elif not self.speaker_history:
            # First turn always starts the rotation from Developer
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

        # Broadcast typing indicator immediately — before any slow I/O
        await self.broadcast({"type": "agent_thinking", "agent_id": next_speaker})

        # One-time init (voice list log etc.) — runs after typing indicator is visible
        await self.ensure_rag_initialized()

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

        # TTS — runs concurrently with debug broadcast prep; fails silently
        audio_data = await self.tts.synthesize(response.speech, next_speaker)

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

        payload: dict = {
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
        }
        if audio_data:
            payload["audio_data"] = audio_data
        await self.broadcast(payload)

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
        """RAG disabled — returns empty until re-enabled."""
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
