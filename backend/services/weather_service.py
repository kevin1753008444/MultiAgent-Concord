import time
import logging
from datetime import datetime, timezone
from typing import Optional
import httpx
from backend.config import OPENWEATHER_API_KEY, BOSTON_COORDS, WEATHER_CACHE_TTL
from backend.models.schemas import WeatherData

logger = logging.getLogger(__name__)


class WeatherService:
    def __init__(self):
        self._cache: Optional[WeatherData] = None
        self._cache_time: float = 0

    async def get_current_weather(self) -> WeatherData:
        now = time.time()
        if self._cache and (now - self._cache_time) < WEATHER_CACHE_TTL:
            return self._cache

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://api.openweathermap.org/data/2.5/weather",
                    params={
                        "lat": BOSTON_COORDS["lat"],
                        "lon": BOSTON_COORDS["lon"],
                        "appid": OPENWEATHER_API_KEY,
                        "units": "imperial",
                    },
                    timeout=5.0
                )
                resp.raise_for_status()
                data = resp.json()

            local_time = datetime.fromtimestamp(
                data["dt"] + data.get("timezone", -18000),
                tz=timezone.utc
            )

            weather = WeatherData(
                condition=data["weather"][0]["main"],
                description=data["weather"][0]["description"],
                temp_f=round(data["main"]["temp"], 1),
                temp_c=round((data["main"]["temp"] - 32) * 5 / 9, 1),
                humidity=data["main"]["humidity"],
                wind_speed=data["wind"]["speed"],
                local_time=local_time,
                time_str=local_time.strftime("%I:%M %p"),
                is_late_night=local_time.hour < 5 or local_time.hour >= 22,
                is_heavy_rain=data["weather"][0]["id"] in range(500, 510),
                pressure_hpa=data["main"]["pressure"]
            )

            self._cache = weather
            self._cache_time = now
            return weather

        except Exception as e:
            logger.warning(f"Weather API unavailable (using fallback): {e}")
            fallback = self._make_fallback()
            self._cache = fallback
            self._cache_time = now  # 缓存 fallback，避免反复请求失败
            return fallback

    def _make_fallback(self) -> WeatherData:
        now = datetime.now(timezone.utc)
        return WeatherData(
            condition="Unknown",
            description="weather data unavailable",
            temp_f=45.0,
            temp_c=7.2,
            humidity=70,
            wind_speed=5.0,
            local_time=now,
            time_str=now.strftime("%I:%M %p"),
            is_late_night=now.hour < 5 or now.hour >= 22,
            is_heavy_rain=False,
            pressure_hpa=1013
        )
