from backend.agents.base_agent import BaseAgent


class AgentPrison(BaseAgent):
    agent_id = "Agent_Prison"
    system_prompt_file = "System Prompt Agent_Prison.md"
    temperature = 1.1  # 情绪更不稳定
