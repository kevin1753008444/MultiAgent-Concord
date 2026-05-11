import base64
import logging

import httpx

import backend.config as cfg

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.elevenlabs.io/v1"
_MODEL = cfg.ELEVENLABS_MODEL


async def log_available_voices() -> None:
    """Fetches and logs all voices available on the account."""
    key = cfg.ELEVENLABS_API_KEY
    if not key:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{_BASE_URL}/voices",
                headers={"xi-api-key": key},
            )
            resp.raise_for_status()
            voices = resp.json().get("voices", [])
            logger.info(f"ElevenLabs — {len(voices)} voices available on this account:")
            for v in voices:
                logger.info(f"  {v['voice_id']}  {v['name']}  (category: {v.get('category', '?')})")
    except Exception as e:
        logger.warning(f"ElevenLabs voice list fetch failed: {e}")


class ElevenLabsService:
    def __init__(self):
        key = cfg.ELEVENLABS_API_KEY
        if key:
            logger.info(f"ElevenLabs TTS ready (key prefix: {key[:8]}…)")
        else:
            logger.warning("ElevenLabs TTS disabled — ELEVENLABS_API_KEY not set")

    async def synthesize(self, text: str, agent_id: str) -> str | None:
        """Returns base64-encoded MP3, or None on failure."""
        key = cfg.ELEVENLABS_API_KEY
        if not key:
            return None

        voice_id = cfg.ELEVENLABS_VOICES.get(agent_id)
        if not voice_id:
            logger.warning(f"No ElevenLabs voice configured for {agent_id}")
            return None

        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(
                    f"{_BASE_URL}/text-to-speech/{voice_id}",
                    headers={
                        "xi-api-key": key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "text": text,
                        "model_id": _MODEL,
                        "voice_settings": {
                            "stability": 0.45,
                            "similarity_boost": 0.75,
                        },
                    },
                )
                resp.raise_for_status()
                return base64.b64encode(resp.content).decode("utf-8")

        except Exception as e:
            logger.warning(f"ElevenLabs TTS failed for {agent_id}: {e}")
            return None
