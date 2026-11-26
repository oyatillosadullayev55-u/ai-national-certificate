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


def _mock_explanation(solution: str) -> str:
    return (
        "[Namuna izoh — AI kaliti ulanmagan]\n\n"
        f"Ekspert yechimi: {solution}\n\n"
        "1. Savolda nima berilgani va nima so'ralganini aniqlang.\n"
        "2. Yechim qadamlarini o'z javobingiz bilan solishtiring.\n"
        "3. Xuddi shu usulni o'xshash masalada qo'llab ko'ring."
    )


_SPEAKING_QUESTIONS = {
    "en": [
        "Nice to meet you! What do you usually do on a normal day?",
        "Interesting. Can you describe your favourite place and explain why you like it?",
        "Tell me about something memorable that happened to you last year.",
        "What is your opinion about learning online? Why do you think so?",
        "If you could change one thing in your city, what would it be and why?",
    ],
    "ru": [
        "Очень приятно! Расскажите, как обычно проходит ваш день?",
        "Интересно. Опишите ваше любимое место и объясните, почему оно вам нравится.",
        "Расскажите о запоминающемся событии, которое произошло в прошлом году.",
        "Что вы думаете об онлайн-обучении? Почему?",
        "Если бы вы могли изменить что-то в своём городе, что бы это было и почему?",
    ],
    "uz": [
        "Tanishganimdan xursandman! Kuningiz odatda qanday o'tadi?",
        "Qiziq. Sevimli joyingizni tasvirlab, nega yoqishini tushuntiring.",
        "O'tgan yili bo'lgan esda qolarli voqea haqida gapirib bering.",
        "Onlayn ta'lim haqida fikringiz qanday? Nega shunday deb o'ylaysiz?",
        "Shahringizda bir narsani o'zgartira olsangiz, nimani va nega o'zgartirardingiz?",
    ],
}


def _mock_assessment(ctx: dict) -> dict:
    """Grammatikani tekshira olmaydi: faqat javob uzunligi va so'z boyligidan taxminiy baho."""
    answers = [t.get("text", "") for t in ctx.get("transcript", []) if t.get("speaker") == "student"]
    # Apostrofli o'zbekcha so'zlar (o'qish) bitta so'z hisoblanadi
    words = [w for a in answers for w in re.findall(r"[^\W\d_]+(?:['\u2018\u2019\u02bb-][^\W\d_]*)*", a.lower())]
    fluency = min(100, round(len(words) / max(1, len(answers)) * 2.5))  # 40 so'zlik javoblar — 100
    vocabulary = min(100, round(len(set(words)) / 1.5))  # 150 xil so'z — 100
    overall = (fluency + vocabulary) / 2
    levels = ["A1", "A2", "B1", "B2"]
    by_score = sum(overall >= limit for limit in (15, 30, 55))
    # Kam material bilan yuqori daraja berilmaydi; grammatika tekshirilmagani uchun mock B2 dan oshmaydi
    by_evidence = sum(len(words) >= minimum for minimum in (15, 80, 200))
    return {
        "level": levels[min(by_score, by_evidence)],
        "fluency": fluency,
        "vocabulary": vocabulary,
        "grammar": None,
        "coherence": None,
        "summary": (
            "[Namuna baho — AI kaliti ulanmagan] Daraja faqat javoblar uzunligi va so'z boyligidan taxminan hisoblandi: "
            f"{len(answers)} ta javob, {len(words)} ta so'z. Grammatika va mazmun tekshirilmadi."
        ),
        "strengths": ["Suhbatni oxirigacha davom ettirdingiz."],
        "improvements": [
            "Har bir javobni 3–4 ta to'liq gap bilan kengaytiring.",
            "Bir xil so'zlarni takrorlamaslikka harakat qiling.",
        ],
        "corrections": [],
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
            if "questions" in props:
                data = _mock_questions(_ctx(messages))
            elif "level" in props:
                data = _mock_assessment(_ctx(messages))
            else:
                data = _mock_plan(_ctx(messages))
            text = json.dumps(data, ensure_ascii=False)
        elif speaking := re.search(r"SPEAKING-EXAMINER lang=(\w+)", system):
            questions = _SPEAKING_QUESTIONS[speaking.group(1)]
            # "(Start the interview.)" xizmat xabari javob hisoblanmaydi
            answered = sum(x["role"] == "user" and not x["content"].startswith("(Start") for x in messages)
            text = questions[(answered - 1) % len(questions)]
        elif m := re.search(r"^Ekspert yechimi: (.*?)(?=\n\n<untrusted |\Z)", last, re.S | re.M):
            # Izoh so'rovi: ichki prompt (teglar, variant ID'lari) o'quvchiga qaytarilmasin
            text = _mock_explanation(m.group(1).strip())
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
