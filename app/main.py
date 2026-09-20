from fastapi import FastAPI

from app.models import EvaluationRequest, EvaluationResponse
from app.services.evaluator import evaluate

app = FastAPI(
    title="Medical Expense Agent API",
    version="0.1.0",
    description="70歳未満の高額療養費を決定的なルールで概算するMVP",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/high-cost-medical-expense/evaluate", response_model=EvaluationResponse)
def evaluate_high_cost_medical_expense(request: EvaluationRequest) -> EvaluationResponse:
    return evaluate(request)
