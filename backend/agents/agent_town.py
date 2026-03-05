from backend.agents.base_agent import BaseAgent


class AgentTown(BaseAgent):
    agent_id = "Agent_Town"
    system_prompt_file = "System Prompt Agent_Town.md"
    temperature = 0.95
