from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from typing import Any

_cases: list[dict[str, Any]] = []
_lock = Lock()


def _value(document: dict[str, Any], key: str, default: Any = None) -> Any:
    field = document.get(key)
    return field.get("value", default) if isinstance(field, dict) else default


def register_uploaded_case(
    document: dict[str, Any],
    *,
    duplicate: bool,
    quality_issues: list[str],
) -> None:
    now = datetime.now(timezone.utc)
    document_id = str(document.get("document_id") or f"upload-{int(now.timestamp())}")
    fields = []
    labels = {
        "name": "患者氏名",
        "service_date": "診療日",
        "service_month": "診療年月",
        "provider_name": "医療機関名",
        "total_medical_cost_yen": "総医療費",
        "patient_paid_yen": "窓口支払額",
        "insurance_number": "保険者番号",
    }
    for key, label in labels.items():
        field = document.get(key)
        if not isinstance(field, dict):
            continue
        value = field.get("value")
        confidence = float(field.get("confidence") or 0)
        fields.append({
            "key": key,
            "label": label,
            "value": "" if value is None else str(value),
            "confidence": confidence,
            "reviewState": "missing" if value is None else "unconfirmed",
            "warning": "OCR結果を確認してください" if confidence < 0.9 else None,
        })

    paid = _value(document, "patient_paid_yen", 0)
    case = {
        "id": f"MED-{now:%Y%m%d}-{len(_cases) + 1:04d}",
        "receivedAt": now.isoformat(),
        "applicantName": _value(document, "name", "未確認") or "未確認",
        "birthDate": str(_value(document, "birth_date", "") or ""),
        "age": 0,
        "insurance": "未確認",
        "incomeCategory": "未確認",
        "serviceMonth": _value(document, "service_month", "未確認") or "未確認",
        "providerName": _value(document, "provider_name", "未確認") or "未確認",
        "careSetting": "入院" if _value(document, "care_setting") == "inpatient" else "外来",
        "discipline": "歯科" if _value(document, "discipline") == "dental" else "医科",
        "program": "高額療養費制度",
        "claimedAmountYen": int(paid) if isinstance(paid, int) else 0,
        "status": "ocr_review",
        "priority": "normal",
        "requiresAttention": True,
        "document": {
            "filename": f"{document_id}.uploaded-image",
            "submittedAt": now.isoformat(),
            "ocrProvider": str(document.get("source") or "ocr"),
            "duplicateSuspected": duplicate,
            "qualityIssues": quality_issues,
        },
        "ocrFields": fields,
        "calculation": {
            "eligibility": "追加情報が必要",
            "selfPaymentLimitYen": None,
            "estimatedBenefitYen": None,
            "inputs": [],
            "formula": None,
            "reasons": ["OCR確認と不足情報の入力後にバックエンドで判定します"],
            "appliedRules": [],
            "exceptionCodes": [],
            "missingInformation": ["所得区分", "加入保険"],
            "source": "api",
        },
        "auditLog": [{
            "id": f"{document_id}-received",
            "timestamp": now.isoformat(),
            "actor": "システム",
            "action": "画像アップロードを受け付け",
            "after": "OCR確認待ち",
        }],
    }
    with _lock:
        _cases.insert(0, case)


def list_uploaded_cases() -> list[dict[str, Any]]:
    with _lock:
        return [dict(case) for case in _cases]
