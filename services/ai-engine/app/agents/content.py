"""Strukturali JSON qaytaruvchi agentlar: savol generatori va shaxsiy o'qish rejasi."""

import json
import logging

from pydantic import ValidationError

from ..gateway import AIGateway
from ..prompts.templates import generate_system, plan_system
from ..providers.base import ProviderError
from ..safety.guard import SYSTEM_CANARY, sanitize_user_text, wrap_untrusted
from ..schemas import (
    GeneratedQuestion,
    GenerateQuestionsReply,
    GenerateQuestionsRequest,
    StudyPlan,
    StudyPlanReply,
    StudyPlanRequest,
    Usage,
)

log = logging.getLogger("ai.content")


def _nullable(t: str) -> dict:
    return {"anyOf": [{"type": t}, {"type": "null"}]}


def _obj(props: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "properties": props, "required": required or list(props), "additionalProperties": False}


QUESTIONS_SCHEMA = _obj(
    {
        "questions": {
            "type": "array",
            "items": _obj(
                {
                    "stem": {"type": "string"},
                    "options": {
                        "type": "array",
                        "items": _obj({"label": {"type": "string"}, "content": {"type": "string"}, "isCorrect": {"type": "boolean"}}),
                    },
                    "numericValue": _nullable("number"),
                    "trueFalseValue": _nullable("boolean"),
                    "solution": {"type": "string"},
                    "explanation": {"type": "string"},
                    "difficulty": {"type": "integer"},
                }
            ),
        }
    }
)

PLAN_SCHEMA = _obj(
    {
        "summary": {"type": "string"},
        "focusTopics": {"type": "array", "items": _obj({"name": {"type": "string"}, "reason": {"type": "string"}})},
        "days": {
            "type": "array",
            "items": _obj(
                {
                    "day": {"type": "integer"},
                    "title": {"type": "string"},
                    "tasks": {
                        "type": "array",
                        "items": _obj(
                            {
                                "kind": {"type": "string", "enum": ["learn", "practice", "review", "test"]},
                                "title": {"type": "string"},
                                "minutes": {"type": "integer"},
                                "topic": _nullable("string"),
                            }
                        ),
                    },
                }
            ),
        },
        "tips": {"type": "array", "items": {"type": "string"}},
    }
)


def _context(data: dict) -> str:
    return f"<context>\n{json.dumps(data, ensure_ascii=False)}\n</context>"


def _well_formed(q: GeneratedQuestion, qtype: str) -> bool:
    """Model sxemaga mos, lekin mazmunan noto'g'ri savol qaytarsa — tashlab yuboramiz."""
    if SYSTEM_CANARY in q.stem or SYSTEM_CANARY in q.solution:
        return False
    correct = sum(o.isCorrect for o in q.options)
    if qtype == "SINGLE_CHOICE":
        return len(q.options) >= 2 and correct == 1
    if qtype == "MULTIPLE_CHOICE":
        return len(q.options) >= 2 and correct >= 1
    if qtype == "TRUE_FALSE":
        return q.trueFalseValue is not None
    if qtype == "NUMERIC":
        return q.numericValue is not None
    return False


class QuestionGeneratorAgent:
    def __init__(self, gateway: AIGateway):
        self.gateway = gateway

    async def generate(self, req: GenerateQuestionsRequest) -> GenerateQuestionsReply:
        instructions = sanitize_user_text(req.instructions or "", 1000)
        if instructions.flagged:
            return GenerateQuestionsReply(questions=[], model="guard", flagged=True)

        ctx = {
            "subject": req.subject,
            "topic": req.topic,
            "type": req.type,
            "count": req.count,
            "difficulty": req.difficulty,
        }
        parts = [
            f"{req.count} ta {req.type} turidagi savol tuz.",
            _context(ctx),
        ]
        if req.topicDescription:
            parts.append(wrap_untrusted("topic_description", req.topicDescription))
        if instructions.text:
            parts.append(wrap_untrusted("author_notes", instructions.text))
        if req.existingStems:
            parts.append(wrap_untrusted("existing_questions", "\n".join(f"- {s[:300]}" for s in req.existingStems)))

        result = await self.gateway.complete(
            generate_system(req.locale),
            [{"role": "user", "content": "\n\n".join(parts)}],
            max_tokens=16000,
            effort="high",
            json_schema=QUESTIONS_SCHEMA,
        )
        usage = Usage(inputTokens=result.input_tokens, outputTokens=result.output_tokens)
        if result.refused:
            return GenerateQuestionsReply(questions=[], model=result.model, flagged=True, usage=usage)
        try:
            raw = json.loads(result.text)["questions"]
            questions = [GeneratedQuestion.model_validate(q) for q in raw]
        except (json.JSONDecodeError, KeyError, TypeError, ValidationError) as e:
            log.warning("generator returned invalid JSON: %s", e)
            raise ProviderError("Model noto'g'ri formatda javob qaytardi") from e

        good = []
        for q in questions:
            if not _well_formed(q, req.type):
                continue
            q.difficulty = min(5, max(1, q.difficulty))
            if req.type in ("TRUE_FALSE", "NUMERIC"):
                q.options = []
            good.append(q)
        return GenerateQuestionsReply(questions=good[: req.count], model=result.model, usage=usage)


class StudyPlanAgent:
    def __init__(self, gateway: AIGateway):
        self.gateway = gateway

    async def plan(self, req: StudyPlanRequest) -> StudyPlanReply:
        goal = sanitize_user_text(req.goal or "", 500)
        if goal.flagged:
            goal.text = ""

        ctx = req.model_dump(exclude={"goal", "locale"})
        parts = ["Quyidagi ma'lumotlar asosida 7 kunlik shaxsiy o'qish rejasini tuz.", _context(ctx)]
        if goal.text:
            parts.append(wrap_untrusted("student_goal", goal.text))

        result = await self.gateway.complete(
            plan_system(req.locale),
            [{"role": "user", "content": "\n\n".join(parts)}],
            max_tokens=12000,
            effort="medium",
            json_schema=PLAN_SCHEMA,
        )
        usage = Usage(inputTokens=result.input_tokens, outputTokens=result.output_tokens)
        if result.refused:
            raise ProviderError("Model rejani tuzishdan bosh tortdi")
        try:
            plan = StudyPlan.model_validate_json(result.text)
        except ValidationError as e:
            log.warning("planner returned invalid JSON: %s", e)
            raise ProviderError("Model noto'g'ri formatda javob qaytardi") from e

        plan.days = sorted(plan.days, key=lambda d: d.day)[:7]
        for d in plan.days:
            for t in d.tasks:
                t.minutes = min(480, max(5, t.minutes))
        return StudyPlanReply(plan=plan, model=result.model, flagged=goal.flagged, usage=usage)
