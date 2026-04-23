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
from backend.models.schemas import AgentResponse, Message, WeatherData, NegotiationPhase
from backend.config import SILENCE_FALLBACK, AUTO_MODE_INTERVAL, DEBUG

logger = logging.getLogger(__name__)

BroadcastFn = Callable[[dict], Awaitable[None]]

_SEED_QUERIES: dict[str, str] = {
    "Agent_Prison": "MCI Concord history buildings infrastructure community programs",
    "Agent_Developer": "DCAMM MCI Concord redevelopment housing Section 107 revenue",
    "Agent_Town": "Concord wastewater treatment plant zoning advisory committee constraints",
}


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
        self._agent_knowledge: dict[str, list[str]] = {}
        self.phase: NegotiationPhase = NegotiationPhase.DEBATE

    # ─── Public API ───────────────────────────────────────────────

    async def ensure_rag_initialized(self) -> dict[str, int]:
        if self._rag_initialized:
            return {}
        await log_available_voices()
        try:
            result = await self.retriever.init_all_knowledgebases()
            self._rag_initialized = True
            logger.info(f"RAG init complete: {result}")
            for agent_id in self.agents:
                chunks = self.retriever.retrieve_all(agent_id)
                self._agent_knowledge[agent_id] = chunks
                logger.info(f"Full knowledge loaded for {agent_id}: {len(chunks)} chunks")
            return result
        except Exception as e:
            logger.error(f"RAG init failed: {e}")
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

        # RAG 检索：用最近 3 条对话作为 query
        rag_chunks = await self._retrieve_for_agent(next_speaker)

        response = await agent.speak(
            history=self.history,
            weather=weather,
            rag_chunks=rag_chunks,
            phase=self.phase,
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
            "urgency_score": response.urgency_score,
            "implicit_challenge_to": response.implicit_challenge_to,
            "phase": self.phase,
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
        self.phase = NegotiationPhase.DEBATE

    def set_phase(self, phase: NegotiationPhase) -> None:
        """Manually override the negotiation phase (e.g. from admin panel)."""
        old = self.phase
        self.phase = phase
        logger.info(f"Phase manually set: {old} → {phase}")

    async def inject_user_message(self, text: str) -> None:
        """Inject a human message into the conversation that all agents will hear."""
        self.history.append(Message(
            session_id=self.session_id,
            sender="USER",
            speech=text,
            directed_at="ALL",
            urgency_score=5,
        ))
        await self.broadcast({
            "type": "user_message",
            "speech": text,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    MODERATOR_SYSTEM = (
        "You are a silent facilitator for a negotiation about the MCI Concord prison redevelopment. "
        "You have no stake in the outcome. Your only job is to move the room. "
        "Write exactly 1–2 plain sentences. Do not summarize — name the specific tension "
        "or opening that has emerged, then ask the one question that could move things forward. "
        "No jargon. No pleasantries. Be direct."
    )

    MODERATOR_PHASE_PROMPTS = {
        NegotiationPhase.DEBATE: (
            "The parties have stated their positions. "
            "Intervene to surface what is actually at stake and open space for the next step."
        ),
        NegotiationPhase.NEGOTIATE: (
            "Some tension has softened. "
            "Intervene to push the parties toward a specific, concrete arrangement."
        ),
    }

    async def _inject_moderator(self) -> None:
        """Generate a moderator intervention, inject it into history, and advance the phase."""
        # Only intervene during DEBATE and NEGOTIATE — RESOLVE runs on its own
        if self.phase == NegotiationPhase.RESOLVE:
            return

        # Build the prompt from recent history
        recent_lines = "\n".join(
            f"[{m.sender}]: {m.speech}" for m in self.history[-8:]
        )
        phase_prompt = self.MODERATOR_PHASE_PROMPTS[self.phase]
        prompt = f"Recent conversation:\n{recent_lines}\n\n{phase_prompt}"

        mod_text = await self.gemini.generate_text(
            system_instruction=self.MODERATOR_SYSTEM,
            prompt=prompt,
            temperature=0.7,
        )
        if not mod_text:
            return

        # Advance phase before broadcasting so agents see the new phase framing
        old_phase = self.phase
        if self.phase == NegotiationPhase.DEBATE:
            self.phase = NegotiationPhase.NEGOTIATE
        elif self.phase == NegotiationPhase.NEGOTIATE:
            self.phase = NegotiationPhase.RESOLVE
        logger.info(f"Moderator fired: phase {old_phase} → {self.phase}")

        # Inject into history so all agents see it in their next prompt
        self.history.append(Message(
            session_id=self.session_id,
            sender="MODERATOR",
            speech=mod_text,
            directed_at="ALL",
            urgency_score=5,
        ))

        await self.broadcast({
            "type": "moderator_message",
            "speech": mod_text,
            "phase": self.phase,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    # ─── Internal ─────────────────────────────────────────────────

    async def _retrieve_for_agent(self, agent_id: str) -> list[str]:
        """Return full pre-loaded knowledge for the agent."""
        return self._agent_knowledge.get(agent_id, [])

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
            "urgency_score": 1,
            "implicit_challenge_to": None,
            "weather_snapshot": {
                "condition": weather.condition,
                "temp_f": weather.temp_f,
                "time_str": weather.time_str,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
