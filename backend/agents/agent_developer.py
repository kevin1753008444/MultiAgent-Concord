from backend.agents.base_agent import BaseAgent


class AgentDeveloper(BaseAgent):
    agent_id = "Agent_Developer"
    system_prompt_file = "System Prompt Agent_Developer.md"
    temperature = 0.8  # 更精准、更商业逻辑
