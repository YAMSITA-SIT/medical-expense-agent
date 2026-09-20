from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.rules.metadata import WORKFLOW_RULES
from app.workflow.codes import EXCEPTION_RULES, Status
from app.workflow.models import CaseRequest, CaseResponse
from app.workflow.ocr import (
    MAX_IMAGE_BYTES,
    OCRProvider,
    duplicate_detector,
    get_ocr_provider,
    image_hash,
    required_review_fields,
    validate_image,
)
from app.workflow.privacy import mask_sensitive
from app.workflow.service import process

router = APIRouter(prefix="/v2")


@router.post("/documents/extract")
async def extract_document(
    request: Request,
    provider: Annotated[OCRProvider, Depends(get_ocr_provider)],
    mask: bool = True,
) -> dict:
    media_type = request.headers.get("content-type", "").split(";")[0]
    if media_type not in {"image/png", "image/jpeg"}:
        raise HTTPException(415, "PNGまたはJPEG画像をraw bodyで送信してください")
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "画像は5MiB以下にしてください")
        data.extend(chunk)
    try:
        validate_image(bytes(data), media_type)
    except ValueError:
        raise HTTPException(422, "画像形式または画素数が無効です") from None
    digest = image_hash(bytes(data))
    duplicate = duplicate_detector.check_and_record(digest)
    try:
        document = await provider.extract(bytes(data), media_type)
    except Exception:
        # Do not include provider errors: they may contain extracted PII.
        raise HTTPException(502, "OCR処理に失敗しました") from None
    finally:
        data.clear()
    result = document.model_dump(mode="json")
    missing = required_review_fields(document) if document.source == "ocr" else []
    return {
        "status": Status.REVIEW,
        "document": mask_sensitive(result) if mask else result,
        "missing_information": missing,
        "calculation_result": None,
        "duplicate_submission_suspected": duplicate,
        "requires_confirmation": True,
        "notice": (
            "MockOCRは画像内容を読まず固定の架空データを返します。"
            if document.source == "mock"
            else "OCR抽出値は候補です。確認・修正し、各項目のconfirmedをtrueにしてください。"
        ),
    }


@router.post("/cases/validate", response_model=CaseResponse)
def validate_case(case: CaseRequest) -> CaseResponse:
    return process(case)


@router.post("/cases/evaluate", response_model=CaseResponse)
def evaluate_case(case: CaseRequest) -> CaseResponse:
    return process(case, calculate_now=True)


@router.get("/rules")
def rules() -> dict:
    return {**WORKFLOW_RULES, "exception_codes": EXCEPTION_RULES}
