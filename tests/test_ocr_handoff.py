from app.workflow.handoff import to_handoff_json
from app.workflow.models import Document


def fictional_document(**overrides) -> Document:
    values = {
        "document_id": "fictional-handoff-1",
        "source": "mock",
        "name": {"value": "架空太郎", "confidence": 0.99},
        "provider_name": {"value": "架空病院", "confidence": 0.99},
        "service_date": {"value": "2026-09-10", "confidence": 0.98},
        "issue_date": {"value": "2026-09-10", "confidence": 0.97},
        "document_type": {"value": "receipt", "confidence": 0.99},
        "care_setting": {"value": "outpatient", "confidence": 0.98},
        "department": {"value": "内科", "confidence": 0.96},
        "total_medical_cost_yen": {"value": 300000, "confidence": 0.99},
        "insurance_covered_amount_yen": {"value": 210000, "confidence": 0.95},
        "patient_paid_yen": {"value": 90000, "confidence": 0.99},
        "uninsured_cost_yen": {"value": 0, "confidence": 0.98},
        "receipt_number": {"value": "FICT-001", "confidence": 0.96},
        "insurer_number": {"value": "00000000", "confidence": 0.94},
        "insurance_symbol": {"value": "架空", "confidence": 0.93},
        "insurance_member_number": {"value": "0001", "confidence": 0.92},
    }
    values.update(overrides)
    return Document.model_validate(values)


def test_handoff_json_is_ready_for_next_agent():
    result = to_handoff_json(fictional_document(), raw_text="架空のOCR原文")
    assert result["schema_version"] == "1.0"
    assert result["document_type"] == "medical_receipt"
    assert result["patient"]["name"] == "架空太郎"
    assert result["treatment"] == {
        "date": "2026-09-10",
        "type": "outpatient",
        "department": "内科",
    }
    assert result["amounts"]["currency"] == "JPY"
    assert result["amounts"]["insurance_covered_amount"] == 210000
    assert result["missing_fields"] == []
    assert result["needs_human_review"] is False
    assert result["raw_text"] == "架空のOCR原文"


def test_missing_and_low_confidence_require_review():
    result = to_handoff_json(
        fictional_document(
            insurer_number={"value": None, "confidence": 0},
            patient_paid_yen={"value": 90000, "confidence": 0.4},
        )
    )
    assert "insurance.insurer_number" in result["missing_fields"]
    assert "amounts.patient_payment" in result["low_confidence_fields"]
    assert result["needs_human_review"] is True


def test_inconsistent_amounts_require_review():
    result = to_handoff_json(
        fictional_document(
            insurance_covered_amount_yen={"value": 200000, "confidence": 0.99}
        )
    )
    assert result["validation_warnings"]
    assert result["needs_human_review"] is True
