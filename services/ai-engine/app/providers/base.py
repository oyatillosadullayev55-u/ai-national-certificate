from dataclasses import dataclass
from typing import Any, Protocol


@dataclass
class LLMResult:
    text: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    # Model xavfsizlik sababli javob bermadi (stop_reason == "refusal")
    refused: bool = False


class LLMProvider(Protocol):
    name: str

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
        """json_schema berilsa — javob matni shu sxemaga mos JSON bo'lishi kafolatlanadi."""
        ...


class ProviderError(Exception):
    pass
