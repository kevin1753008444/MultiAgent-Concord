from backend.agents.base_agent import BaseAgent


class AgentDeveloper(BaseAgent):
    agent_id = "Agent_Developer"
    system_prompt_file = "System Prompt Agent_Developer.md"
    temperature = 1.0
