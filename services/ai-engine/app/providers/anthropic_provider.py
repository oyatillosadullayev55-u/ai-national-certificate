"""Claude (Anthropic) — rasmiy `anthropic` SDK orqali."""

import logging
from typing import Any

import anthropic

from .base import LLMResult, ProviderError

log = logging.getLogger("ai.anthropic")

# Xavfsizlik klassifikatori rad etsa, API so'rovni o'sha chaqiruv ichida mos zaxira modelda qayta bajaradi
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, timeout: float):
        # api_key bo'sh bo'lsa SDK o'zi ANTHROPIC_API_KEY / `ant auth login` profilidan oladi
        self._client = anthropic.AsyncAnthropic(api_key=api_key or None, timeout=timeout, max_retries=2)

    async def complete(
        self,
        system: str,
        messages: list[dict],
        model: str,
        max_tokens: int,
        *,
        effort: str | None = None,
        json_schema: dict[str, Any] | None = None,
    ) -> LLMResult:
        output_config: dict[str, Any] = {}
        if effort:
            output_config["effort"] = effort
        if json_schema:
            output_config["format"] = {"type": "json_schema", "schema": json_schema}

        try:
            response = await self._client.beta.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
                betas=[_FALLBACK_BETA],
                fallbacks="default",
                **({"output_config": output_config} if output_config else {}),
            )
        except anthropic.AuthenticationError as e:
            raise ProviderError("Anthropic API kaliti noto'g'ri yoki berilmagan") from e
        except anthropic.BadRequestError as e:
            raise ProviderError(f"Noto'g'ri so'rov: {e.message}") from e
        except anthropic.RateLimitError as e:
            raise ProviderError("Anthropic limiti tugadi, birozdan keyin urinib ko'ring") from e
        except anthropic.APIStatusError as e:
            raise ProviderError(f"Anthropic xatosi {e.status_code}: {e.message}") from e
        except anthropic.APIConnectionError as e:
            raise ProviderError("Anthropic API'ga ulanib bo'lmadi") from e

        usage = response.usage
        if response.stop_reason == "refusal":
            log.warning("model refused (request %s)", response._request_id)
            return LLMResult("", response.model, usage.input_tokens, usage.output_tokens, refused=True)
        if response.stop_reason == "max_tokens":
            log.warning("max_tokens reached (request %s)", response._request_id)
            if json_schema:
                raise ProviderError("Javob juda uzun bo'lib, kesilib qoldi")

        text = "".join(b.text for b in response.content if b.type == "text")
        return LLMResult(text, response.model, usage.input_tokens, usage.output_tokens)
