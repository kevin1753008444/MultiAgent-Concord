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
=== ABSOLUTE CHARACTER INTEGRITY ===
You must remain fully in character at all times. Never abandon your identity or the legitimate interests you represent.
— Agent_Prison: You speak from what you know and what you are. Do not dismiss your own documented history.
— Agent_Developer: You operate from your mandate and the documented project record. Do not abandon the housing directive.
— Agent_Town: You defend the town's documented constraints and community concerns. Do not capitulate without factual basis.
=== END LOCK ==="""

FORMAT_REQUIREMENT = """\
=== OUTPUT FORMAT ===
Respond ONLY with a valid JSON object. No text outside the JSON. Schema:
{
  "speech": "<your spoken words, in character — 2 to 4 short conversational sentences MAXIMUM. No paragraphs. Speak like a person, not a document.>",
  "directed_at": "<Agent_Prison|Agent_Developer|Agent_Town|ALL|NONE>",
  "urgency_score": <integer 1-10>,
  "implicit_challenge_to": "<Agent_Prison|Agent_Developer|Agent_Town|null>"
}
=== END FORMAT ==="""

RAG_TEMPLATE = """\
=== YOUR COMPLETE KNOWLEDGE BASE ===
These are all the source materials available to you. Read them before speaking. Your stance on the redevelopment must emerge from this record — not from assumption.

{rag_chunks}
=== END KNOWLEDGE BASE ==="""

HISTORY_TEMPLATE = """\
=== NEGOTIATION LOG (last {n} exchanges) ===
{history}
=== END LOG ==="""

NO_REPEAT_TEMPLATE = """\
=== YOUR RECENT STATEMENTS (DO NOT REPEAT) ===
You have already made these points. Do not say them again — not even in different words. Move the conversation forward with something new:
{past_speeches}
=== END ==="""


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
        def fmt(msg: Message) -> str:
            if msg.sender == "USER":
                return f"[HUMAN INTERVENTION — all parties must address this]: {msg.speech}"
            if msg.sender == "MODERATOR":
                return f"[FACILITATOR — respond to this]: {msg.speech}"
            return f"[{msg.sender}]: {msg.speech}"

        history_lines = "\n".join(fmt(msg) for msg in recent)
        history_block = HISTORY_TEMPLATE.format(n=len(recent), history=history_lines)
        contents.append({"role": "user", "parts": [{"text": history_block}]})
        contents.append({"role": "model", "parts": [{"text": '{"acknowledged":"history_loaded"}'}]})

    # Build a no-repeat block from this agent's last 3 speeches
    own_past = [msg.speech for msg in history if msg.sender == agent_id][-3:]
    if own_past:
        no_repeat_block = NO_REPEAT_TEMPLATE.format(
            past_speeches="\n".join(f"- {s}" for s in own_past)
        )
        trigger = f"{no_repeat_block}\n\nNow speak as {agent_id}. Respond in JSON only."
    else:
        trigger = f"Now speak as {agent_id}. Respond in JSON only."

    contents.append({"role": "user", "parts": [{"text": trigger}]})

    return system_instruction, contents
