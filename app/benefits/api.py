from fastapi import APIRouter

from app.benefits.models import BenefitEvaluationRequest, BenefitEvaluationResponse
from app.benefits.rule_store import load_pattern_support, load_rules
from app.benefits.service import evaluate_benefits

router = APIRouter(prefix="/v3/benefits", tags=["benefits"])


@router.post("/evaluate-ocr", response_model=BenefitEvaluationResponse)
def evaluate_ocr_output(request: BenefitEvaluationRequest) -> BenefitEvaluationResponse:
    return evaluate_benefits(request)


@router.get("/rules")
def rules() -> dict:
    return {"schema_version": "1.0", "rules": load_rules()}


@router.get("/pattern-support")
def pattern_support() -> dict:
    return {"schema_version": "1.0", "patterns": load_pattern_support()}
