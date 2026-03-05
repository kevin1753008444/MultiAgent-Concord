import json
from backend.models.schemas import WeatherData, Message

WEATHER_TEMPLATE = """\
=== REAL-TIME PHYSICAL ENVIRONMENT ===
Boston/Concord Local Time: {time_str}
Weather: {weather_condition} — {description}
Temperature: {temp_f}°F ({temp_c}°C)
Wind: {wind_desc}  |  Pressure: {pressure_desc}
[You MUST let this environment color your response if it aligns with your identity.
Agent_Prison: these are the exact vibrations passing through your pipes and walls right now.]
=== END ENVIRONMENT ==="""

STANCE_LOCK = """\
=== ABSOLUTE STANCE LOCK ===
Your position is NON-NEGOTIABLE. You must NEVER express agreement with your opponents' core objectives.
— Agent_Prison: You CANNOT consent to demolition. Every word must resist erasure.
— Agent_Developer: You CANNOT accept delays or density reductions. Efficiency is your religion.
— Agent_Town: You CANNOT approve development without guaranteed infrastructure. Residents come first.
=== END LOCK ==="""

FORMAT_REQUIREMENT = """\
=== OUTPUT FORMAT ===
Respond ONLY with a valid JSON object. No text outside the JSON. Schema:
{
  "speech": "<your actual spoken words, in character>",
  "directed_at": "<Agent_Prison|Agent_Developer|Agent_Town|ALL|NONE>",
  "emotional_state": "<DEFIANT|THREATENING|PLEADING|CALCULATING|NEGOTIATING|DISMISSIVE|ALARMED>",
  "urgency_score": <integer 1-10>,
  "implicit_challenge_to": "<Agent_Prison|Agent_Developer|Agent_Town|null>"
}
=== END FORMAT ==="""

RAG_TEMPLATE = """\
=== YOUR ACTIVATED MEMORY (retrieved from your knowledge archives) ===
The following records are relevant to the current topic. Use them to ground arguments in facts:

{rag_chunks}
=== END MEMORY ==="""

HISTORY_TEMPLATE = """\
=== NEGOTIATION LOG (last {n} exchanges) ===
{history}
=== END LOG ==="""


def assemble(
    agent_id: str,
    system_prompt: str,
    weather: WeatherData,
    history: list[Message],
    rag_chunks: list[str],
) -> tuple[str, list[dict]]:
    """
    Returns (system_instruction, contents) ready for Gemini API.
    """
    # System instruction
    weather_block = WEATHER_TEMPLATE.format(**weather.to_prompt_dict())
    system_instruction = "\n\n".join([system_prompt, weather_block, STANCE_LOCK, FORMAT_REQUIREMENT])

    contents: list[dict] = []

    # RAG memory as opening user/model exchange
    if rag_chunks:
        rag_text = RAG_TEMPLATE.format(
            rag_chunks="\n\n---\n\n".join(
                f"[Memory {i + 1}]: {chunk}" for i, chunk in enumerate(rag_chunks)
            )
        )
        contents.append({"role": "user", "parts": [{"text": rag_text}]})
        contents.append({"role": "model", "parts": [{"text": '{"acknowledged":"memory_loaded"}'}]})

    # Conversation history (last 10 messages)
    recent = history[-10:] if len(history) > 10 else history
    if recent:
        history_lines = "\n".join(
            f"[{msg.sender}]: {msg.speech}" for msg in recent
        )
        history_block = HISTORY_TEMPLATE.format(n=len(recent), history=history_lines)
        contents.append({"role": "user", "parts": [{"text": history_block}]})
        contents.append({"role": "model", "parts": [{"text": '{"acknowledged":"history_loaded"}'}]})

    # Final trigger
    contents.append({
        "role": "user",
        "parts": [{"text": f"Now speak as {agent_id}. Respond in JSON only."}]
    })

    return system_instruction, contents
