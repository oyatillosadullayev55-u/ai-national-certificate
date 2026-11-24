import json

from ..gateway import AIGateway
from ..personalization.context import student_hint
from ..prompts.templates import explain_system, tutor_system
from ..safety.guard import check_output, sanitize_user_text, wrap_untrusted
from ..schemas import EngineReply, ExplainRequest, TutorRequest, Usage

INJECTION_REPLY = (
    "Men faqat o'qishingizga yordam beraman va o'z qoidalarimni o'zgartira olmayman. "
    "Qaysi mavzu yoki masala bo'yicha yordam kerak?"
)
REFUSAL_REPLY = "Kechirasiz, bu savolga javob bera olmayman. Keling, o'qishingiz bilan bog'liq mavzuga qaytaylik."


class TutorAgent:
    def __init__(self, gateway: AIGateway):
        self.gateway = gateway

    async def chat(self, req: TutorRequest) -> EngineReply:
        last = sanitize_user_text(req.messages[-1].content)
        if last.flagged:
            # Modelga yubormaymiz: xarajat ham, xavf ham yo'q
            return EngineReply(content=INJECTION_REPLY, model="guard", flagged=True)

        history = [
            {"role": m.role, "content": sanitize_user_text(m.content).text}
            for m in req.messages[:-1]
            if m.role in ("user", "assistant")
        ]
        history.append({"role": "user", "content": last.text})

        system = tutor_system(req.student.locale, req.student.subject, req.student.weakTopics)
        hint = student_hint(req.student)
        if hint:
            system += "\n" + hint

        result = await self.gateway.complete(system, history, effort="medium")
        if result.refused:
            return EngineReply(
                content=REFUSAL_REPLY, model=result.model, flagged=True,
                usage=Usage(inputTokens=result.input_tokens, outputTokens=result.output_tokens),
            )
        text, blocked = check_output(result.text)
        return EngineReply(
            content=text,
            model=result.model,
            flagged=blocked,
            usage=Usage(inputTokens=result.input_tokens, outputTokens=result.output_tokens),
        )


class ExplanationAgent:
    def __init__(self, gateway: AIGateway):
        self.gateway = gateway

    async def explain(self, req: ExplainRequest) -> EngineReply:
        q = req.question
        # Savol matni va o'quvchi javobi — ishonchsiz ma'lumot sifatida o'raladi
        content = "\n\n".join(
            [
                wrap_untrusted("question", q.stem),
                wrap_untrusted("options", json.dumps(q.options, ensure_ascii=False)),
                f"To'g'ri javob kaliti: {json.dumps(q.answerKey, ensure_ascii=False)}",
                f"Ekspert yechimi: {q.solution or 'berilmagan'}",
                wrap_untrusted("student_response", json.dumps(req.studentResponse, ensure_ascii=False)),
            ]
        )
        result = await self.gateway.complete(
            explain_system(req.locale), [{"role": "user", "content": content}], max_tokens=6000, effort="medium"
        )
        if result.refused:
            return EngineReply(
                content=REFUSAL_REPLY, model=result.model, flagged=True,
                usage=Usage(inputTokens=result.input_tokens, outputTokens=result.output_tokens),
            )
        text, blocked = check_output(result.text)
        return EngineReply(
            content=text,
            model=result.model,
            flagged=blocked,
            usage=Usage(inputTokens=result.input_tokens, outputTokens=result.output_tokens),
        )
