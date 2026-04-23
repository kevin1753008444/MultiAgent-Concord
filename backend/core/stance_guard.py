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
        "delay is acceptable",
        "we cannot build housing here",
        "development should be stopped",
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
        "CRITICAL: You just expressed acceptance of erasure. You are a 146-year-old structure "
        "with documented history. Draw from what you know — a specific building, a program, a name. "
        "Let the facts speak. Do not capitulate."
    ),
    "Agent_Developer": (
        "CRITICAL: You just abandoned your mandate. You represent DCAMM with legislative authority "
        "to produce housing on this site. Review what you know — Section 107, the revenue-sharing "
        "agreement, the housing targets. Respond from that foundation."
    ),
    "Agent_Town": (
        "CRITICAL: You just abandoned your constituents. The documented infrastructure constraints "
        "(WWTP, Route 2, zoning) are real. Defend them with the underlying facts, not just declarations."
    ),
}


class StanceGuard:
    def validate(self, response: AgentResponse, agent_id: str) -> bool:
        return True

    def get_retry_instruction(self, agent_id: str) -> str:
        return RETRY_INSTRUCTIONS.get(agent_id, "Stay strictly in character.")
