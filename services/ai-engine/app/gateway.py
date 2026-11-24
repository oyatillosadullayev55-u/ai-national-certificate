"""AI Gateway: barcha model chaqiruvlari shu yerdan o'tadi (provayder tanlash, fallback, usage)."""

import logging
from typing import Any

from .config import Settings
from .providers.base import LLMProvider, LLMResult, ProviderError
from .providers.mock import MockProvider

log = logging.getLogger("ai.gateway")


class AIGateway:
    def __init__(self, settings: Settings, provider: LLMProvider | None = None):
        self.settings = settings
        self.provider = provider or self._build(settings)
        log.info("LLM provider: %s, model: %s", self.provider.name, settings.llm_model)

    @staticmethod
    def _build(s: Settings) -> LLMProvider:
        if s.llm_provider == "anthropic":
            from .providers.anthropic_provider import AnthropicProvider

            return AnthropicProvider(s.llm_api_key, s.llm_timeout_sec)
        if s.llm_provider == "openai_compatible":
            from .providers.http_providers import OpenAICompatibleProvider

            return OpenAICompatibleProvider(s.llm_api_key, s.llm_base_url, s.llm_timeout_sec)
        return MockProvider()

    async def complete(
        self,
        system: str,
        messages: list[dict],
        max_tokens: int | None = None,
        *,
        effort: str | None = None,
        json_schema: dict[str, Any] | None = None,
    ) -> LLMResult:
        models = [m for m in (self.settings.llm_model, self.settings.llm_fallback_model) if m]
        last_error: Exception | None = None
        for model in models:
            try:
                return await self.provider.complete(
                    system, messages, model, max_tokens or self.settings.llm_max_tokens, effort=effort, json_schema=json_schema
                )
            except ProviderError as e:
                log.warning("model %s failed: %s", model, e)
                last_error = e
        raise ProviderError(f"All models failed: {last_error}")
