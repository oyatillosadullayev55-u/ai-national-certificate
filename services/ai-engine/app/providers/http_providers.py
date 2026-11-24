from typing import Any

import httpx

from .base import LLMResult, ProviderError


class OpenAICompatibleProvider:
    """OpenAI Chat Completions formatini qo'llaydigan har qanday provayder (o'z serveringizdagi model ham)."""

    name = "openai_compatible"

    def __init__(self, api_key: str, base_url: str, timeout: float):
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"), timeout=timeout, headers={"authorization": f"Bearer {api_key}"}
        )

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
        body: dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [{"role": "system", "content": system}, *messages],
        }
        if json_schema:
            body["response_format"] = {"type": "json_schema", "json_schema": {"name": "output", "schema": json_schema, "strict": True}}
        try:
            r = await self._client.post("/chat/completions", json=body)
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise ProviderError(str(e)) from e
        data = r.json()
        usage = data.get("usage", {})
        return LLMResult(
            data["choices"][0]["message"]["content"],
            data.get("model", model),
            usage.get("prompt_tokens", 0),
            usage.get("completion_tokens", 0),
        )
