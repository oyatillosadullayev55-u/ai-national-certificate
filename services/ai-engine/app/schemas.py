from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(max_length=8000)


class StudentContext(BaseModel):
    locale: str = "uz_latn"
    subject: str | None = None
    weakTopics: list[str] = Field(default_factory=list)


class TutorRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    student: StudentContext = Field(default_factory=StudentContext)


class QuestionForExplain(BaseModel):
    type: str
    stem: str
    options: list[dict[str, Any]] = Field(default_factory=list)
    answerKey: Any = None
    solution: str | None = None
    explanation: str | None = None


class ExplainRequest(BaseModel):
    locale: str = "uz_latn"
    question: QuestionForExplain
    studentResponse: Any = None


class Usage(BaseModel):
    inputTokens: int = 0
    outputTokens: int = 0


class EngineReply(BaseModel):
    content: str
    model: str
    flagged: bool = False
    usage: Usage = Field(default_factory=Usage)


# ───────────── AI savol generatori (admin / metodist) ─────────────

GeneratableType = Literal["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "NUMERIC"]


class GenerateQuestionsRequest(BaseModel):
    locale: str = "uz_latn"
    subject: str = Field(max_length=200)
    topic: str = Field(max_length=300)
    topicDescription: str | None = Field(default=None, max_length=2000)
    type: GeneratableType = "SINGLE_CHOICE"
    count: int = Field(default=5, ge=1, le=10)
    difficulty: int = Field(default=3, ge=1, le=5)
    instructions: str | None = Field(default=None, max_length=1000)
    # Mavjud savollar matni — takrorlanmasligi uchun
    existingStems: list[str] = Field(default_factory=list, max_length=20)


class GeneratedOption(BaseModel):
    label: str
    content: str
    isCorrect: bool


class GeneratedQuestion(BaseModel):
    stem: str
    options: list[GeneratedOption] = Field(default_factory=list)
    numericValue: float | None = None
    trueFalseValue: bool | None = None
    solution: str
    explanation: str
    difficulty: int = 3


class GenerateQuestionsReply(BaseModel):
    questions: list[GeneratedQuestion]
    model: str
    flagged: bool = False
    usage: Usage = Field(default_factory=Usage)


# ───────────── AI shaxsiy o'qish rejasi (o'quvchi) ─────────────


class WeakTopic(BaseModel):
    name: str = Field(max_length=300)
    subject: str | None = Field(default=None, max_length=200)
    mastery: float = 0


class RecentResult(BaseModel):
    title: str = Field(max_length=300)
    percent: int = 0


class StudyPlanRequest(BaseModel):
    locale: str = "uz_latn"
    daysToExam: int | None = None
    minutesPerDay: int = Field(default=60, ge=15, le=480)
    subjects: list[str] = Field(default_factory=list, max_length=20)
    weakTopics: list[WeakTopic] = Field(default_factory=list, max_length=20)
    errorsDue: int = 0
    recentResults: list[RecentResult] = Field(default_factory=list, max_length=10)
    goal: str | None = Field(default=None, max_length=500)


class PlanTask(BaseModel):
    kind: Literal["learn", "practice", "review", "test"]
    title: str
    minutes: int
    topic: str | None = None


class PlanDay(BaseModel):
    day: int
    title: str
    tasks: list[PlanTask]


class FocusTopic(BaseModel):
    name: str
    reason: str


class StudyPlan(BaseModel):
    summary: str
    focusTopics: list[FocusTopic]
    days: list[PlanDay]
    tips: list[str]


class StudyPlanReply(BaseModel):
    plan: StudyPlan
    model: str
    flagged: bool = False
    usage: Usage = Field(default_factory=Usage)


# ───────────── Ovozli suhbat va til darajasi ─────────────

SpeakingLanguage = Literal["en", "ru", "uz"]
CefrLevel = Literal["A1", "A2", "B1", "B2", "C1", "C2"]


class SpeakingRequest(BaseModel):
    language: SpeakingLanguage
    # Izoh va tavsiyalar yoziladigan til
    locale: str = "uz_latn"
    messages: list[ChatMessage] = Field(min_length=1, max_length=60)


class SpeakingCorrection(BaseModel):
    original: str
    corrected: str


class SpeakingAssessment(BaseModel):
    level: CefrLevel
    # 0..100; None — bu ko'rsatkich baholanmagan
    fluency: int | None = None
    vocabulary: int | None = None
    grammar: int | None = None
    coherence: int | None = None
    summary: str
    strengths: list[str]
    improvements: list[str]
    corrections: list[SpeakingCorrection]


class SpeakingAssessReply(BaseModel):
    assessment: SpeakingAssessment
    model: str
    flagged: bool = False
    usage: Usage = Field(default_factory=Usage)
