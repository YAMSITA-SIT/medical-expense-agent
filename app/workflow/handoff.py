from __future__ import annotations

from typing import Any

from app.workflow.codes import OCR_MIN_CONFIDENCE
from app.workflow.models import Document

_FIELD_PATHS = {
    "document_type": "document_type",
    "patient.name": "name",
    "medical_institution.name": "provider_name",
    "treatment.date": "service_date",
    "issue_date": "issue_date",
    "amounts.total_medical_cost": "total_medical_cost_yen",
    "amounts.insurance_covered_amount": "insurance_covered_amount_yen",
    "amounts.patient_payment": "patient_paid_yen",
    "amounts.non_covered_amount": "uninsured_cost_yen",
    "treatment.type": "care_setting",
    "treatment.department": "department",
    "receipt_number": "receipt_number",
    "insurance.insurer_number": "insurer_number",
    "insurance.symbol": "insurance_symbol",
    "insurance.number": "insurance_member_number",
}

_DOCUMENT_TYPES = {
    "receipt": "medical_receipt",
    "itemized_statement": "itemized_statement",
}


def _value(document: Document, field: str) -> Any:
    return getattr(document, field).value


def _confidence(document: Document, field: str) -> float:
    return getattr(document, field).confidence


def amount_consistency_issues(document: Document) -> list[str]:
    total = _value(document, "total_medical_cost_yen")
    covered = _value(document, "insurance_covered_amount_yen")
    paid = _value(document, "patient_paid_yen")
    non_covered = _value(document, "uninsured_cost_yen")
    if None in {total, covered, paid, non_covered}:
        return []
    if covered + paid != total + non_covered:
        return [
            "金額の整合性を確認してください: "
            "保険適用額＋患者自己負担額が総医療費＋保険適用外金額と一致しません"
        ]
    return []


def to_handoff_json(
    document: Document,
    *,
    raw_text: str | None = None,
    image_quality_issues: list[str] | None = None,
) -> dict[str, Any]:
    missing_fields = [
        path for path, field in _FIELD_PATHS.items() if _value(document, field) is None
    ]
    low_confidence_fields = [
        path
        for path, field in _FIELD_PATHS.items()
        if _value(document, field) is not None and _confidence(document, field) < OCR_MIN_CONFIDENCE
    ]
    consistency_issues = amount_consistency_issues(document)
    quality_issues = image_quality_issues or []

    return {
        "schema_version": "1.0",
        "document_id": document.document_id,
        "document_type": _DOCUMENT_TYPES.get(_value(document, "document_type")),
        "patient": {"name": _value(document, "name")},
        "medical_institution": {"name": _value(document, "provider_name")},
        "treatment": {
            "date": (
                document.service_date.value.isoformat() if document.service_date.value else None
            ),
            "type": _value(document, "care_setting"),
            "department": _value(document, "department"),
        },
        "issue_date": (
            document.issue_date.value.isoformat() if document.issue_date.value else None
        ),
        "amounts": {
            "total_medical_cost": _value(document, "total_medical_cost_yen"),
            "insurance_covered_amount": _value(document, "insurance_covered_amount_yen"),
            "patient_payment": _value(document, "patient_paid_yen"),
            "non_covered_amount": _value(document, "uninsured_cost_yen"),
            "currency": "JPY",
        },
        "receipt_number": _value(document, "receipt_number"),
        "insurance": {
            "insurer_number": _value(document, "insurer_number"),
            "symbol": _value(document, "insurance_symbol"),
            "number": _value(document, "insurance_member_number"),
        },
        "confidence": {
            path: _confidence(document, field) for path, field in _FIELD_PATHS.items()
        },
        "missing_fields": missing_fields,
        "low_confidence_fields": low_confidence_fields,
        "validation_warnings": [*quality_issues, *consistency_issues],
        "needs_human_review": bool(
            missing_fields or low_confidence_fields or quality_issues or consistency_issues
        ),
        "raw_text": raw_text,
    }
