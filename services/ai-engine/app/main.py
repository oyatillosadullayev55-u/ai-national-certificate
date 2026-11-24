import hmac
import logging

from fastapi import Depends, FastAPI, Header, HTTPException

from .agents.content import QuestionGeneratorAgent, StudyPlanAgent
from .agents.tutor import ExplanationAgent, TutorAgent
from .config import Settings, get_settings
from .gateway import AIGateway
from .providers.base import ProviderError
from .schemas import (
    EngineReply,
    ExplainRequest,
    GenerateQuestionsReply,
    GenerateQuestionsRequest,
    StudyPlanReply,
    StudyPlanRequest,
    TutorRequest,
)

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="AI National Certificate — AI Engine", version="0.1.0")

_gateway: AIGateway | None = None


def get_gateway(settings: Settings = Depends(get_settings)) -> AIGateway:
    global _gateway
    if _gateway is None:
        _gateway = AIGateway(settings)
    return _gateway


def require_internal_key(x_internal_key: str = Header(default=""), settings: Settings = Depends(get_settings)) -> None:
    """Faqat NestJS API chaqira oladi — servis tashqi tarmoqqa ochilmaydi."""
    if not hmac.compare_digest(x_internal_key, settings.internal_api_key):
        raise HTTPException(status_code=401, detail="invalid internal key")


@app.get("/health")
def health(settings: Settings = Depends(get_settings)) -> dict:
    return {"status": "ok", "provider": settings.llm_provider, "model": settings.llm_model}


@app.post("/v1/tutor/chat", response_model=EngineReply, dependencies=[Depends(require_internal_key)])
async def tutor_chat(req: TutorRequest, gw: AIGateway = Depends(get_gateway)) -> EngineReply:
    try:
        return await TutorAgent(gw).chat(req)
    except ProviderError as e:
        raise HTTPException(status_code=503, detail="model unavailable") from e


@app.post("/v1/questions/generate", response_model=GenerateQuestionsReply, dependencies=[Depends(require_internal_key)])
async def generate_questions(req: GenerateQuestionsRequest, gw: AIGateway = Depends(get_gateway)) -> GenerateQuestionsReply:
    try:
        return await QuestionGeneratorAgent(gw).generate(req)
    except ProviderError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@app.post("/v1/study-plan", response_model=StudyPlanReply, dependencies=[Depends(require_internal_key)])
async def study_plan(req: StudyPlanRequest, gw: AIGateway = Depends(get_gateway)) -> StudyPlanReply:
    try:
        return await StudyPlanAgent(gw).plan(req)
    except ProviderError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@app.post("/v1/explain", response_model=EngineReply, dependencies=[Depends(require_internal_key)])
async def explain(req: ExplainRequest, gw: AIGateway = Depends(get_gateway)) -> EngineReply:
    try:
        return await ExplanationAgent(gw).explain(req)
    except ProviderError as e:
        raise HTTPException(status_code=503, detail="model unavailable") from e
