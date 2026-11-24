import json
import re
from typing import Any

from .base import LLMResult


def _ctx(messages: list[dict]) -> dict:
    """Agentlar oxirgi xabarda <context>{json}</context> yuboradi — mock shundan foydalanadi."""
    last = messages[-1]["content"] if messages else ""
    m = re.search(r"<context>\s*(\{.*\})\s*</context>", last, re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return {}


def _mock_questions(ctx: dict) -> dict:
    topic = ctx.get("topic") or "mavzu"
    qtype = ctx.get("type", "SINGLE_CHOICE")
    diff = int(ctx.get("difficulty") or 3)
    out = []
    for i in range(int(ctx.get("count") or 3)):
        a, b = 3 + i, 4 + 2 * i
        q: dict[str, Any] = {
            "stem": f"[Namuna] «{topic}»: $x = {a}$ va $y = {b}$ bo'lsa, $x + y$ nechaga teng?",
            "options": [],
            "numericValue": None,
            "trueFalseValue": None,
            "solution": f"$x + y = {a} + {b} = {a + b}$.",
            "explanation": "Qiymatlarni o'rniga qo'yib, qo'shamiz.",
            "difficulty": diff,
        }
        if qtype in ("SINGLE_CHOICE", "MULTIPLE_CHOICE"):
            vals = [a + b, a + b + 1, a + b - 1, a * b]
            q["options"] = [
                {"label": l, "content": f"${v}$", "isCorrect": v == a + b} for l, v in zip("ABCD", vals)
            ]
        elif qtype == "NUMERIC":
            q["numericValue"] = a + b
        elif qtype == "TRUE_FALSE":
            q["stem"] = f"[Namuna] «{topic}»: $x = {a}$, $y = {b}$ bo'lsa, $x + y = {a + b}$. To'g'rimi?"
            q["trueFalseValue"] = True
        out.append(q)
    return {"questions": out}


def _mock_plan(ctx: dict) -> dict:
    weak = [w.get("name") for w in ctx.get("weakTopics", [])] or ["Asosiy mavzular"]
    minutes = int(ctx.get("minutesPerDay") or 45)
    days = []
    for d in range(1, 8):
        topic = weak[(d - 1) % len(weak)]
        tasks = [
            {"kind": "learn", "title": f"«{topic}» nazariyasini takrorlash", "minutes": minutes // 3, "topic": topic},
            {"kind": "practice", "title": f"«{topic}» bo'yicha 10 ta mashq", "minutes": minutes // 3, "topic": topic},
            {"kind": "review", "title": "Xatolar daftaridan takrorlash", "minutes": minutes - 2 * (minutes // 3), "topic": None},
        ]
        if d == 7:
            tasks = [{"kind": "test", "title": "Haftalik nazorat testi", "minutes": minutes, "topic": None}]
        days.append({"day": d, "title": f"{d}-kun: {topic}" if d < 7 else "7-kun: haftalik nazorat", "tasks": tasks})
    return {
        "summary": "[Namuna reja — AI kaliti ulanmagan] Zaif mavzularga e'tibor qaratamiz va har kuni ozgina takrorlaymiz.",
        "focusTopics": [{"name": n, "reason": "O'zlashtirish past"} for n in weak[:3]],
        "days": days,
        "tips": ["Har kuni bir xil vaqtda o'qing.", "Xatolaringizni albatta qayta yeching."],
    }


class MockProvider:
    """Development va testlar uchun: tashqi API'ga murojaat qilmaydi."""

    name = "mock"

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
        last = messages[-1]["content"] if messages else ""
        if json_schema:
            props = json_schema.get("properties", {})
            data = _mock_questions(_ctx(messages)) if "questions" in props else _mock_plan(_ctx(messages))
            text = json.dumps(data, ensure_ascii=False)
        else:
            text = (
                "Keling, bosqichma-bosqich ko'rib chiqamiz.\n\n"
                f"Savolingiz: «{last[:200]}»\n\n"
                "1. Avval berilganlarni yozib olamiz.\n"
                "2. Qaysi qoida yoki formula kerakligini aniqlaymiz.\n"
                "3. Hisoblab, natijani tekshiramiz.\n\n"
                "Birinchi qadamni o'zingiz bajarib ko'ring — nima berilgan?"
            )
        return LLMResult(text=text, model="mock", input_tokens=len(system + last) // 4, output_tokens=len(text) // 4)
