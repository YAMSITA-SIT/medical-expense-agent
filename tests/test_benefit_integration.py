from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from app.benefits.rule_store import load_pattern_support
from app.main import app

client = TestClient(app)


def payload(month: str = "2026-07") -> dict:
    return {
        "patient": {"person_id": "SYNTHETIC-1", "birth_date": "1990-01-01"},
        "service_month": month,
        "insurance": {"type": "employee", "insurer_number": "SYNTHETIC-INSURER"},
        "income": {
            "category": "C", "standard_monthly_remuneration_yen": 300000,
            "resident_tax_exempt": False,
        },
        "costs": {
            "total_medical_cost_yen": 1000000, "insurance_covered_cost_yen": 1000000,
            "patient_paid_yen": 300000, "uninsured_cost_yen": 0,
        },
        "care": {
            "setting": "inpatient", "discipline": "medical",
            "provider_id": "SYNTHETIC-HOSPITAL",
        },
        "prior_12_month_benefit_months": [],
        "special_cases": {"screening_completed": True},
        "ocr_confidence": {"patient_paid_yen": 0.99},
    }


def test_calculates_with_traceable_rule():
    response = client.post("/v3/benefits/evaluate-ocr", json=payload())
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "calculated"
    assert body["calculation"]["self_payment_limit"] == 87430
    assert body["calculation"]["estimated_benefit"] == 212570
    assert body["applied_rules"][0]["rule_id"] == "hcm-70u-2015-c"


def test_reform_boundary_selects_different_rules():
    july = client.post("/v3/benefits/evaluate-ocr", json=payload("2026-07")).json()
    august = client.post("/v3/benefits/evaluate-ocr", json=payload("2026-08")).json()
    assert july["applied_rules"][0]["rule_id"] == "hcm-70u-2015-c"
    assert august["applied_rules"][0]["rule_id"] == "hcm-70u-2026-c"
    assert august["calculation"]["self_payment_limit"] == 92940


def test_missing_income_stops_calculation():
    data = payload()
    data["income"]["category"] = None
    body = client.post("/v3/benefits/evaluate-ocr", json=data).json()
    assert body["status"] == "additional_information_required"
    assert "income.category" in body["missing_fields"]
    assert body["calculation"] is None


def test_low_confidence_requires_confirmation():
    data = payload()
    data["ocr_confidence"]["patient_paid_yen"] = 0.5
    body = client.post("/v3/benefits/evaluate-ocr", json=data).json()
    assert body["status"] == "additional_information_required"
    assert "confirmed_fields.patient_paid_yen" in body["missing_fields"]


@pytest.mark.parametrize("flag", [
    "public_funding", "psychiatric_outpatient", "workers_compensation",
    "third_party_injury", "supplementary_benefit", "specified_disease",
    "overseas_care", "orthotic_device", "annual_cap",
    "insurance_changed_during_month", "turned_75_during_month",
])
def test_special_cases_stop_for_review(flag):
    data = payload()
    data["special_cases"][flag] = True
    body = client.post("/v3/benefits/evaluate-ocr", json=data).json()
    assert body["status"] == "human_review_required"
    assert body["calculation"] is None


def test_amount_mismatch_stops():
    data = payload()
    data["costs"]["uninsured_cost_yen"] = 1
    body = client.post("/v3/benefits/evaluate-ocr", json=data).json()
    assert body["status"] == "human_review_required"


def test_32_pattern_registry_is_complete_and_explicit():
    patterns = load_pattern_support()
    assert [item["id"] for item in patterns] == [f"P{i:02d}" for i in range(1, 33)]
    allowed = {"implemented", "conditional", "unsupported", "human_review_required"}
    assert all(item["status"] in allowed for item in patterns)
    assert next(x for x in patterns if x["id"] == "P22")["status"] == "unsupported"
    assert next(x for x in patterns if x["id"] == "P23")["status"] == "unsupported"


def test_multiple_occurrence_and_household_aggregation():
    data = payload()
    data["prior_12_month_benefit_months"] = ["2025-10", "2026-01", "2026-04"]
    data["household_expenses"] = [{
        "person_id": "SYNTHETIC-2", "age": 30, "insurer_number": "SYNTHETIC-INSURER",
        "provider_id": "SYNTHETIC-HOSPITAL-2", "setting": "outpatient", "discipline": "medical",
        "total_medical_cost_yen": 100000, "patient_paid_yen": 30000, "insurance_covered": True,
    }]
    body = client.post("/v3/benefits/evaluate-ocr", json=data).json()
    assert body["status"] == "calculated"
    assert body["calculation"]["self_payment_limit"] == 44400


def test_out_of_period_is_not_guessed():
    body = client.post("/v3/benefits/evaluate-ocr", json=payload("2027-08")).json()
    assert body["status"] == "human_review_required"
    assert body["calculation"] is None


def test_request_is_strict_and_does_not_accept_unknown_fields():
    data = deepcopy(payload())
    data["patient"]["name"] = "do-not-accept-unneeded-pii"
    response = client.post("/v3/benefits/evaluate-ocr", json=data)
    assert response.status_code == 422
    assert "do-not-accept-unneeded-pii" not in response.text
