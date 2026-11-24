from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    internal_api_key: str = "dev-only-ai_internal_key"

    # mock | anthropic | openai_compatible
    llm_provider: str = "mock"
    # anthropic uchun bo'sh qolsa ANTHROPIC_API_KEY muhit o'zgaruvchisi ishlatiladi
    llm_api_key: str = ""
    llm_base_url: str = ""  # openai_compatible uchun, masalan https://api.openai.com/v1
    llm_model: str = "claude-sonnet-5-5"
    llm_fallback_model: str = ""  # asosiy model ishlamasa
    # Javob + fikrlash (adaptive thinking) tokenlari uchun; juda kichik bo'lsa javob kesilib qoladi
    llm_max_tokens: int = 8000
    llm_timeout_sec: float = 120.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
