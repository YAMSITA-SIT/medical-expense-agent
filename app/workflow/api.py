from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.rules.metadata import WORKFLOW_RULES
from app.staff_cases import list_upload_history, register_upload
from app.workflow.codes import EXCEPTION_RULES, Status
from app.workflow.handoff import to_handoff_json
from app.workflow.models import CaseRequest, CaseResponse
from app.workflow.ocr import (
    MAX_IMAGE_BYTES,
    OCRProvider,
    duplicate_detector,
    get_ocr_provider,
    image_hash,
    image_quality_issues,
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
    """
    領収書・診療明細の画像を受け取り、OCR処理を行う。

    画像のアップロードに成功した場合は、個人情報を含まない
    アップロード履歴だけを開発用メモリへ登録する。
    """

    media_type = request.headers.get("content-type", "").split(";")[0]

    if media_type not in {"image/png", "image/jpeg"}:
        raise HTTPException(
            status_code=415,
            detail="PNGまたはJPEG画像をraw bodyで送信してください",
        )

    data = bytearray()

    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_IMAGE_BYTES:
            raise HTTPException(
                status_code=413,
                detail="画像は5MiB以下にしてください",
            )

        data.extend(chunk)

    try:
        validate_image(bytes(data), media_type)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="画像形式または画素数が無効です",
        ) from None

    digest = image_hash(bytes(data))
    duplicate = duplicate_detector.check_and_record(digest)
    quality_issues = image_quality_issues(bytes(data))

    try:
        document = await provider.extract(bytes(data), media_type)
    except Exception:
        # OCRサービス側のエラーには個人情報が含まれる可能性があるため、
        # 詳細なエラー内容は利用者へ返さない。
        raise HTTPException(
            status_code=502,
            detail="OCR処理に失敗しました",
        ) from None
    finally:
        # アップロード画像をメモリ上へ残さない。
        data.clear()

    result = document.model_dump(mode="json")

    missing = (
        required_review_fields(document)
        if document.source == "ocr"
        else []
    )

    handoff = to_handoff_json(
        document,
        raw_text=document.raw_text if not mask else None,
        image_quality_issues=quality_issues,
    )

    # 個人情報、画像、医療費、OCR本文は保存せず、
    # アップロードが行われたという履歴だけを登録する。
    register_upload(
        source=document.source,
        duplicate_suspected=duplicate,
        quality_issues=quality_issues,
    )

    return {
        "status": Status.REVIEW,
        "document": mask_sensitive(result) if mask else result,
        "handoff": mask_sensitive(handoff) if mask else handoff,
        "missing_information": missing,
        "calculation_result": None,
        "duplicate_submission_suspected": duplicate,
        "requires_confirmation": True,
        "notice": (
            "MockOCRは画像内容を読まず固定の架空データを返します。"
            if document.source == "mock"
            else (
                "OCR抽出値は候補です。確認・修正し、"
                "各項目のconfirmedをtrueにしてください。"
            )
        ),
    }


@router.get("/staff/uploads")
def staff_uploads() -> dict:
    """
    職員画面用のアップロード履歴を返す。

    開発用の一時保存であり、氏名、画像、医療費、
    OCR結果などの個人情報・医療情報は返さない。
    """

    return {
        "items": list_upload_history(),
        "storage": "memory",
        "notice": (
           
            
        ),
    }


@router.post("/cases/validate", response_model=CaseResponse)
def validate_case(case: CaseRequest) -> CaseResponse:
    """
    申請データの不足情報や例外条件を検証する。
    """

    return process(case)


@router.post("/cases/evaluate", response_model=CaseResponse)
def evaluate_case(case: CaseRequest) -> CaseResponse:
    """
    確認済みの申請データを決定的なルールで計算する。
    """

    return process(case, calculate_now=True)


@router.get("/rules")
def rules() -> dict:
    """
    制度ルールと例外コードを返す。
    """

    return {
        **WORKFLOW_RULES,
        "exception_codes": EXCEPTION_RULES,
    }