from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.models import EvaluationRequest, EvaluationResponse
from app.services.evaluator import evaluate
from app.workflow.api import router

app = FastAPI(
    title="Medical Expense Agent API",
    version="0.1.0",
    description="70歳未満の高額療養費を決定的なルールで概算するMVP",
)
app.include_router(router)


@app.exception_handler(RequestValidationError)
async def safe_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Pydantic's default error response can echo names, dates or account numbers.
    return JSONResponse(
        status_code=422,
        content={
            "detail": [
                {
                    "loc": list(error["loc"]),
                    "type": error["type"],
                    "msg": "入力形式を確認してください",
                }
                for error in exc.errors()
            ]
        },
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/high-cost-medical-expense/evaluate", response_model=EvaluationResponse)
def evaluate_high_cost_medical_expense(request: EvaluationRequest) -> EvaluationResponse:
    return evaluate(request)
