import random
import logging
from backend.models.schemas import AgentResponse
from backend.config import MAX_CONSECUTIVE_SPEAKS

logger = logging.getLogger(__name__)

ALL_AGENTS = ["Agent_Prison", "Agent_Developer", "Agent_Town"]


class RoutingEngine:
    def get_next_speaker(
        self,
        last_response: AgentResponse,
        last_speaker: str,
        speaker_history: list[str],  # 最近发言顺序（最新在末尾）
        weather_is_late_night: bool = False,
        weather_is_heavy_rain: bool = False,
    ) -> tuple[str, dict[str, float]]:
        """
        返回 (next_agent_id, weights_dict)
        weights_dict 用于 debug 模式广播
        """
        # --- Layer 1: 硬规则 ---
        hard = self._apply_hard_rules(last_response, last_speaker, speaker_history)
        if hard:
            logger.debug(f"Routing [hard rule] → {hard}")
            weights = {a: (1.0 if a == hard else 0.0) for a in ALL_AGENTS}
            return hard, weights

        # --- Layer 2: 权重计算 ---
        weights = self._compute_weights(
            last_response, last_speaker, speaker_history,
            weather_is_late_night, weather_is_heavy_rain
        )

        # --- Layer 3: 加权随机 ---
        agents = list(weights.keys())
        w_values = [max(0.01, weights[a]) for a in agents]  # 保证非零
        selected = random.choices(agents, weights=w_values, k=1)[0]

        logger.debug(f"Routing [weighted random] weights={weights} → {selected}")
        return selected, weights

    def _apply_hard_rules(
        self,
        last_response: AgentResponse,
        last_speaker: str,
        speaker_history: list[str],
    ) -> str | None:
        directed = last_response.directed_at

        # 明确点名（非 ALL/NONE）
        if directed not in ["ALL", "NONE"]:
            # 防止无限乒乓：目标连续发言次数检查
            recent = speaker_history[-(MAX_CONSECUTIVE_SPEAKS):]
            consecutive = all(s == directed for s in recent) if recent else False
            if not consecutive:
                return directed

        return None

    def _compute_weights(
        self,
        last_response: AgentResponse,
        last_speaker: str,
        speaker_history: list[str],
        weather_is_late_night: bool,
        weather_is_heavy_rain: bool,
    ) -> dict[str, float]:
        weights = {a: 1.0 for a in ALL_AGENTS}

        # 加分：隐性挑战
        challenge = last_response.get_challenge_target()
        if challenge and challenge in weights:
            weights[challenge] += 3.0

        # 加分：directed_at=ALL → 非发言者均 +1.5
        if last_response.directed_at == "ALL":
            for a in ALL_AGENTS:
                if a != last_speaker:
                    weights[a] += 1.5

        # 加分：情绪驱动
        emotion = last_response.emotional_state
        if emotion in ("THREATENING", "DEFIANT"):
            weights["Agent_Prison"] += 2.0   # 威胁/对抗激发监狱恐惧感
        if emotion == "NEGOTIATING":
            weights["Agent_Town"] += 2.0      # 谈判时小镇最想介入
        if emotion == "CALCULATING":
            weights["Agent_Town"] += 1.5      # 商业计算激怒小镇
            weights["Agent_Developer"] += 0.5  # 开发商可能追加

        # 加分：紧迫度
        urgency_bonus = (last_response.urgency_score - 5) * 0.3
        for a in ALL_AGENTS:
            if a != last_speaker:
                weights[a] += max(0.0, urgency_bonus)

        # 加分：深夜暴雨 → 监狱独白概率翻倍
        if weather_is_late_night and weather_is_heavy_rain:
            weights["Agent_Prison"] *= 2.5

        # 减分：连续发言惩罚
        consecutive_count = 0
        for s in reversed(speaker_history):
            if s == last_speaker:
                consecutive_count += 1
            else:
                break
        penalty = max(0.1, 1.0 - consecutive_count * 0.6)
        weights[last_speaker] *= penalty

        return weights
