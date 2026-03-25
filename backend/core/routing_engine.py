import logging
from backend.models.schemas import AgentResponse

logger = logging.getLogger(__name__)

ROTATION = ["Agent_Developer", "Agent_Prison", "Agent_Town"]


class RoutingEngine:
    def get_next_speaker(
        self,
        last_response: AgentResponse,
        last_speaker: str,
        speaker_history: list[str],
        weather_is_late_night: bool = False,
        weather_is_heavy_rain: bool = False,
    ) -> tuple[str, dict[str, float]]:
        try:
            idx = ROTATION.index(last_speaker)
        except ValueError:
            idx = -1
        next_agent = ROTATION[(idx + 1) % len(ROTATION)]
        weights = {a: (1.0 if a == next_agent else 0.0) for a in ROTATION}
        logger.debug(f"Routing [round-robin] {last_speaker} → {next_agent}")
        return next_agent, weights
