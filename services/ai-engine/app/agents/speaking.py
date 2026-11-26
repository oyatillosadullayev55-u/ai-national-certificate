"""Ovozli suhbat: imtihon oluvchi (keyingi savol) va CEFR bo'yicha til darajasini baholash."""

import json
import logging

from pydantic import ValidationError

from ..gateway import AIGateway
from ..prompts.templates import speaking_assess_system, speaking_turn_system
from ..providers.base import ProviderError
from ..safety.guard import check_output, sanitize_user_text, wrap_untrusted
from ..schemas import (
    EngineReply,
    SpeakingAssessment,
    SpeakingAssessReply,
    SpeakingRequest,
    Usage,
)

log = logging.getLogger("ai.speaking")

REDIRECT = {
    "en": "Let's keep practising your English. What do you usually do in your free time?",
    "ru": "Давайте продолжим практиковать русский язык. Чем вы обычно занимаетесь в свободное время?",
    "uz": "Keling, o'zbek tilida suhbatni davom ettiramiz. Bo'sh vaqtingizda nima qilasiz?",
}


def _obj(props: dict) -> dict:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


_SCORE = {"anyOf": [{"type": "integer"}, {"type": "null"}]}
_STRINGS = {"type": "array", "items": {"type": "string"}}

ASSESSMENT_SCHEMA = _obj(
    {
        "level": {"type": "string", "enum": ["A1", "A2", "B1", "B2", "C1", "C2"]},
        "fluency": _SCORE,
        "vocabulary": _SCORE,
        "grammar": _SCORE,
        "coherence": _SCORE,
        "summary": {"type": "string"},
        "strengths": _STRINGS,
        "improvements": _STRINGS,
        "corrections": {"type": "array", "items": _obj({"original": {"type": "string"}, "corrected": {"type": "string"}})},
    }
)


def _usage(result) -> Usage:
    return Usage(inputTokens=result.input_tokens, outputTokens=result.output_tokens)


class SpeakingAgent:
    def __init__(self, gateway: AIGateway):
        self.gateway = gateway

    async def turn(self, req: SpeakingRequest) -> EngineReply:
        last = sanitize_user_text(req.messages[-1].content, 2000)
        if last.flagged:
            return EngineReply(content=REDIRECT[req.language], model="guard", flagged=True)

        history = [
            {"role": m.role, "content": sanitize_user_text(m.content, 2000).text}
            for m in req.messages
            if m.role in ("user", "assistant")
        ]
        # Suhbatni imtihon oluvchi boshlaydi; model API'si esa birinchi xabar "user" bo'lishini kutadi
        if history[0]["role"] == "assistant":
            history.insert(0, {"role": "user", "content": "(Start the interview.)"})

        result = await self.gateway.complete(speaking_turn_system(req.language), history, max_tokens=3000, effort="low")
        if result.refused:
            return EngineReply(content=REDIRECT[req.language], model=result.model, flagged=True, usage=_usage(result))
        text, blocked = check_output(result.text)
        if blocked:
            text = REDIRECT[req.language]
        return EngineReply(content=text, model=result.model, flagged=blocked, usage=_usage(result))

    async def assess(self, req: SpeakingRequest) -> SpeakingAssessReply:
        flagged = False
        transcript = []
        for m in req.messages:
            checked = sanitize_user_text(m.content, 2000)
            if m.role == "user" and checked.flagged:
                flagged = True
                continue
            if m.role in ("user", "assistant"):
                transcript.append({"speaker": "student" if m.role == "user" else "examiner", "text": checked.text})

        context = json.dumps({"language": req.language, "transcript": transcript}, ensure_ascii=False)
        content = "Assess the student's speaking level from this transcript.\n\n" + wrap_untrusted(
            "transcript", f"<context>\n{context}\n</context>"
        )
        result = await self.gateway.complete(
            speaking_assess_system(req.language, req.locale),
            [{"role": "user", "content": content}],
            max_tokens=8000,
            effort="medium",
            json_schema=ASSESSMENT_SCHEMA,
        )
        if result.refused:
            raise ProviderError("Model baholashdan bosh tortdi")
        text, blocked = check_output(result.text)
        if blocked:
            raise ProviderError("Model noto'g'ri javob qaytardi")
        try:
            assessment = SpeakingAssessment.model_validate_json(text)
        except ValidationError as e:
            log.warning("assessor returned invalid JSON: %s", e)
            raise ProviderError("Model noto'g'ri formatda javob qaytardi") from e

        for field in ("fluency", "vocabulary", "grammar", "coherence"):
            score = getattr(assessment, field)
            if score is not None:
                setattr(assessment, field, min(100, max(0, score)))
        return SpeakingAssessReply(assessment=assessment, model=result.model, flagged=flagged, usage=_usage(result))
