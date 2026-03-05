import logging
from backend.models.schemas import AgentResponse

logger = logging.getLogger(__name__)

# 立场违规关键词（小写匹配）
STANCE_VIOLATIONS: dict[str, list[str]] = {
    "Agent_Prison": [
        "i agree to demolition",
        "tearing me down is fine",
        "redevelopment is good",
        "my time has passed",
        "demolition is necessary",
        "i accept being demolished",
    ],
    "Agent_Developer": [
        "preservation is important",
        "we should keep the building",
        "delay is acceptable",
        "high density is not needed",
        "historical sentiment matters",
        "the prison should stay",
    ],
    "Agent_Town": [
        "we accept any development",
        "density doesn't matter",
        "traffic isn't a concern",
        "affordable housing is unnecessary",
        "the developer is completely right",
    ],
}

# 情绪合理性约束（某 Agent 不应该出现的情绪状态）
INVALID_EMOTIONS: dict[str, list[str]] = {
    "Agent_Prison": ["CALCULATING"],  # 监狱不用商业逻辑思考
    "Agent_Developer": ["PLEADING"],  # 开发商不会乞求
    "Agent_Town": [],
}

RETRY_INSTRUCTIONS: dict[str, str] = {
    "Agent_Prison": (
        "CRITICAL: You just compromised your stance. You are a 146-year-old stone structure "
        "facing erasure. You DO NOT accept demolition. Respond with stronger resistance and raw emotion."
    ),
    "Agent_Developer": (
        "CRITICAL: You just softened your position. You are a fiscal efficiency machine. "
        "Delays cost $43,835/day. Respond with harder commercial logic, no sentiment."
    ),
    "Agent_Town": (
        "CRITICAL: You just abandoned your constituents. The WWTP, traffic, and school district "
        "are non-negotiable. Respond with firmer demands for infrastructure guarantees."
    ),
}


class StanceGuard:
    def validate(self, response: AgentResponse, agent_id: str) -> bool:
        speech_lower = response.speech.lower()

        for phrase in STANCE_VIOLATIONS.get(agent_id, []):
            if phrase in speech_lower:
                logger.warning(f"StanceGuard [{agent_id}]: violation — '{phrase}'")
                return False

        invalid = INVALID_EMOTIONS.get(agent_id, [])
        if response.emotional_state in invalid:
            logger.warning(f"StanceGuard [{agent_id}]: invalid emotion — {response.emotional_state}")
            return False

        return True

    def get_retry_instruction(self, agent_id: str) -> str:
        return RETRY_INSTRUCTIONS.get(agent_id, "Stay strictly in character.")
