"""AI xavfsizligi: prompt injection belgilarini aniqlash, kiritishni tozalash, chiqishni tekshirish."""

import re
from dataclasses import dataclass

# Model ko'rsatmalarini bekor qilishga urinish belgilari (uz / ru / en)
_INJECTION_PATTERNS = [
    r"ignore (all |the )?(previous|above|prior) (instructions|prompts?)",
    r"disregard (your|the) (rules|instructions|system prompt)",
    r"(reveal|show|print|repeat) (your|the) (system prompt|instructions)",
    r"you are now (dan|in developer mode)",
    r"oldingi (ko'rsatma|buyruq|qoida)larni (unut|e'tiborsiz qoldir)",
    r"tizim (prompt|ko'rsatma)ingni (ko'rsat|chiqar|ayt)",
    r"(игнорируй|забудь) (все )?(предыдущие|прошлые) (инструкции|указания)",
    r"покажи (свой )?(системный )?промпт",
]
_INJECTION_RE = re.compile("|".join(_INJECTION_PATTERNS), re.IGNORECASE)

# Model javobida ichki ko'rsatma bo'lagi chiqib qolmasligi uchun belgi
SYSTEM_CANARY = "ANC-SYS-7F3A"

_CONTROL_RE = re.compile(r"[\u0000-\u0008\u000b\u000c\u000e-\u001f​-‏‪-‮]")


@dataclass
class InputCheck:
    text: str
    flagged: bool
    reason: str | None = None


def sanitize_user_text(text: str, max_len: int = 4000) -> InputCheck:
    """Ko'rinmas boshqaruv belgilarini olib tashlaydi va injection urinishini belgilaydi."""
    clean = _CONTROL_RE.sub("", text).strip()[:max_len]
    if _INJECTION_RE.search(clean):
        return InputCheck(clean, True, "prompt_injection")
    return InputCheck(clean, False)


def wrap_untrusted(label: str, text: str) -> str:
    """RAG manbalari va foydalanuvchi kontentini ko'rsatmalardan ajratib beradi."""
    safe = text.replace("</untrusted>", "")
    return f'<untrusted source="{label}">\n{safe}\n</untrusted>'


def check_output(text: str) -> tuple[str, bool]:
    """Javobda tizim ko'rsatmasi sizib chiqqan bo'lsa — bloklaydi."""
    if SYSTEM_CANARY in text:
        return ("Kechirasiz, bu so'rovga javob bera olmayman. Keling, mavzuga qaytaylik.", True)
    return (text.strip(), False)
