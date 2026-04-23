from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime
from enum import Enum


class NegotiationPhase(str, Enum):
    DEBATE = "debate"        # Agents press their positions
    NEGOTIATE = "negotiate"  # Common ground starts emerging
    RESOLVE = "resolve"      # Agents work toward concrete commitments

AgentId = Literal["Agent_Prison", "Agent_Developer", "Agent_Town"]
DirectedAt = Literal["Agent_Prison", "Agent_Developer", "Agent_Town", "ALL", "NONE"]


class AgentResponse(BaseModel):
    speech: str
    directed_at: DirectedAt
    urgency_score: int  # 1-10
    emotional_state: Optional[str] = None
    implicit_challenge_to: Optional[str] = None

    def get_challenge_target(self) -> Optional[str]:
        """返回被隐性挑战的 AgentId，NONE 视为 None"""
        val = self.implicit_challenge_to
        if val and val != "NONE":
            return val
        return None


class WeatherData(BaseModel):
    condition: str
    description: str
    temp_f: float
    temp_c: float
    humidity: int
    wind_speed: float
    local_time: datetime
    time_str: str
    is_late_night: bool
    is_heavy_rain: bool
    pressure_hpa: int

    def to_prompt_dict(self) -> dict:
        return {
            "time_str": self.time_str,
            "weather_condition": self.condition,
            "description": self.description,
            "temp_f": self.temp_f,
            "temp_c": self.temp_c,
            "wind_desc": f"{self.wind_speed} mph",
            "pressure_desc": f"{self.pressure_hpa} hPa",
        }


class Message(BaseModel):
    id: Optional[int] = None
    session_id: str
    sender: str  # AgentId or "USER" or "SYSTEM"
    speech: str
    directed_at: Optional[str] = None
    emotional_state: Optional[str] = None
    urgency_score: Optional[int] = None
    weather_snapshot: Optional[dict] = None
    created_at: Optional[datetime] = None


# WebSocket 广播格式
class WsAgentMessage(BaseModel):
    type: Literal["agent_message"] = "agent_message"
    agent_id: str
    speech: str
    directed_at: str
    emotional_state: str
    urgency_score: int
    weather_snapshot: Optional[dict] = None
    timestamp: str


class WsThinkingMessage(BaseModel):
    type: Literal["agent_thinking"] = "agent_thinking"
    agent_id: str


class WsWeatherUpdate(BaseModel):
    type: Literal["weather_update"] = "weather_update"
    data: dict


class WsError(BaseModel):
    type: Literal["error"] = "error"
    message: str
    fallback_text: Optional[str] = None


class WsRoutingDebug(BaseModel):
    type: Literal["routing_debug"] = "routing_debug"
    weights: dict[str, float]
    selected: str
