import logging
from backend.models.schemas import AgentResponse

logger = logging.getLogger(__name__)

AGENTS = ["Agent_Developer", "Agent_Prison", "Agent_Town"]

# If an agent has been absent this many turns in a row, they cut in regardless.
MAX_SILENCE = 2


def _longest_absent(speaker_history: list[str], exclude: str) -> str | None:
    """Return the agent (not the current speaker) silent the longest, or None."""
    others = [a for a in AGENTS if a != exclude]
    if not speaker_history:
        return others[0]
    def turns_since(agent: str) -> int:
        for i, s in enumerate(reversed(speaker_history)):
            if s == agent:
                return i
        return len(speaker_history)  # never spoken
    silent = max(others, key=turns_since)
    if turns_since(silent) >= MAX_SILENCE:
        return silent
    return None


class RoutingEngine:
    def get_next_speaker(
        self,
        last_response: AgentResponse,
        last_speaker: str,
        speaker_history: list[str],
        weather_is_late_night: bool = False,
        weather_is_heavy_rain: bool = False,
    ) -> tuple[str, dict[str, float]]:

        # 0. Silence check — if an agent has been locked out too long, they go next
        overdue = _longest_absent(speaker_history, exclude=last_speaker)
        if overdue:
            next_agent = overdue
            reason = f"overdue ({overdue} silent {MAX_SILENCE}+ turns)"

        # 1. Direct address — respond to whoever was spoken to
        elif (
            last_response.directed_at in AGENTS
            and last_response.directed_at != last_speaker
        ):
            next_agent = last_response.directed_at
            reason = "direct-address"

        # 2. Implicit challenge — challenged party gets to respond
        elif (
            last_response.implicit_challenge_to in AGENTS
            and last_response.implicit_challenge_to != last_speaker
        ):
            next_agent = last_response.implicit_challenge_to
            reason = "implicit-challenge"

        # 3. Round-robin fallback
        else:
            idx = AGENTS.index(last_speaker) if last_speaker in AGENTS else -1
            next_agent = AGENTS[(idx + 1) % len(AGENTS)]
            reason = "round-robin"

        weights = {a: (1.0 if a == next_agent else 0.0) for a in AGENTS}
        logger.debug(f"Routing [{reason}] {last_speaker} → {next_agent}")
        return next_agent, weights
