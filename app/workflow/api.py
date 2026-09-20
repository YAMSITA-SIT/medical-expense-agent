from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.rules.metadata import WORKFLOW_RULES
from app.workflow.codes import EXCEPTION_RULES, Status
from app.workflow.models import CaseRequest, CaseResponse
from app.workflow.ocr import MAX_IMAGE_BYTES, OCRProvider, get_ocr_provider, validate_image
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
    try:
        document = await provider.extract(bytes(data), media_type)
    except Exception:
        # Do not include provider errors: they may contain extracted PII.
        raise HTTPException(502, "OCR処理に失敗しました") from None
    finally:
        data.clear()
    result = document.model_dump(mode="json")
    return {
        "status": Status.REVIEW,
        "document": mask_sensitive(result) if mask else result,
        "requires_confirmation": True,
        "notice": "mockは画像内容を読まず固定の架空データを返します。"
        "抽出値を確認・修正し、各項目のconfirmedをtrueにして送信してください。"
        "mask=trueの伏字を計算入力へ転記しないでください。",
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
