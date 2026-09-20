import json
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.workflow.codes import EXCEPTION_RULES, ExceptionCode

client = TestClient(app)


@pytest.fixture
def case():
    return json.loads(Path("examples/workflow_case.json").read_text())


def evaluate(case):
    response = client.post("/v2/cases/evaluate", json=case)
    assert response.status_code == 200, response.text
    return response.json()


def test_single_and_preflight(case):
    ready = client.post("/v2/cases/validate", json=case).json()
    assert ready["status"] == "ready_for_calculation"
    assert ready["calculation_result"] is None
    result = evaluate(case)
    assert result["status"] == "calculation_completed"
    assert result["calculation_result"]["self_payment_limit_yen"] == 87430
    assert result["calculation_result"]["estimated_refund_yen"] == 212570
    assert "1980-01-15" not in json.dumps(result)


def test_household(case):
    second = deepcopy(case["people"][0])
    second["person_id"] = "fictional-person-2"
    case["people"].append(second)
    expense = deepcopy(case["expenses"][0])
    expense.update(expense_id="fictional-expense-2", person_id=second["person_id"])
    case["expenses"].append(expense)
    result = evaluate(case)["calculation_result"]
    assert result["eligible_patient_paid_yen"] == 600000
    assert result["self_payment_limit_yen"] == 97430
    assert result["estimated_refund_yen"] == 502570


@pytest.mark.parametrize(
    "field",
    [
        "income_category",
        "high_cost_benefit_count_previous_12_months",
        "exception_screening_completed",
        "receipt_state",
    ],
)
def test_missing(case, field):
    case.pop(field)
    result = evaluate(case)
    assert result["status"] == "additional_information_required"
    assert result["calculation_result"] is None
    assert any(
        m["field"] == field and m["question"] and m["reason"] for m in result["missing_information"]
    )


@pytest.mark.parametrize(
    "cost_type", ["private_room", "meal", "living", "advanced_medical", "uninsured"]
)
def test_exclusions(case, cost_type):
    expense = deepcopy(case["expenses"][0])
    expense.update(
        expense_id="excluded",
        insurance_covered=False,
        cost_type=cost_type,
        patient_paid_yen=50000,
        total_medical_cost_yen=50000,
        receipt_patient_paid_yen=None,
        receipt_total_medical_cost_yen=None,
    )
    case["expenses"].append(expense)
    result = evaluate(case)["calculation_result"]
    assert result["excluded_patient_paid_yen"] == 50000
    assert result["estimated_refund_yen"] == 212570


@pytest.mark.parametrize("event", list(ExceptionCode))
def test_every_exception_stops_calculation(case, event):
    case["events"] = [event.value]
    result = evaluate(case)
    assert result["status"] not in {"ready_for_calculation", "calculation_completed"}
    assert result["calculation_result"] is None
    finding = result["exception_codes"][0]
    assert finding["code"] == event.value
    assert finding["required_action"]
    assert event in EXCEPTION_RULES


@pytest.mark.parametrize(
    ("event", "status"),
    [
        ("INSURANCE_CHANGED_DURING_MONTH", "manual_review_required"),
        ("PUBLIC_FUNDING", "manual_review_required"),
        ("SPECIFIED_DISEASE", "manual_review_required"),
        ("DUPLICATE_APPLICATION", "duplicate_suspected"),
        ("TAX_CORRECTED", "recalculation_required"),
    ],
)
def test_requested_routes(case, event, status):
    case["events"] = [event]
    assert evaluate(case)["status"] == status


def test_receipt_pending(case):
    case["receipt_state"] = "pending"
    result = evaluate(case)
    assert result["status"] == "pending_receipt"
    assert result["calculation_result"] is None


def test_amount_mismatch(case):
    case["expenses"][0]["receipt_patient_paid_yen"] = 299999
    result = evaluate(case)
    assert result["status"] == "manual_review_required"
    assert result["exception_codes"][0]["code"] == "AMOUNT_MISMATCH"


def test_duplicate_data_and_application(case):
    case["expenses"].append(deepcopy(case["expenses"][0]))
    case["prior_application_ids"] = [case["case_id"]]
    result = evaluate(case)
    assert result["status"] == "duplicate_suspected"
    assert len(result["exception_codes"]) == 2


def test_multiple_exceptions_preserve_missing(case):
    case["income_category"] = None
    case["receipt_state"] = "pending"
    case["events"] = ["PUBLIC_FUNDING", "DUPLICATE_APPLICATION"]
    result = evaluate(case)
    assert result["status"] == "duplicate_suspected"
    assert len(result["exception_codes"]) == 3
    assert result["missing_information"]


def test_fractional_yen_not_guessed(case):
    case["expenses"][0]["total_medical_cost_yen"] = 1000050
    case["expenses"][0]["receipt_total_medical_cost_yen"] = 1000050
    assert evaluate(case)["exception_codes"][0]["code"] == "ROUNDING_UNVERIFIED"


def test_multiple_occurrence(case):
    case["high_cost_benefit_count_previous_12_months"] = 3
    result = evaluate(case)["calculation_result"]
    assert result["self_payment_limit_yen"] == 44400
    assert result["estimated_refund_yen"] == 255600


@pytest.mark.parametrize(
    "field,value",
    [
        ("patient_paid_yen", 1.2),
        ("patient_paid_yen", True),
        ("patient_paid_yen", -1),
        ("patient_paid_yen", "300000"),
    ],
)
def test_strict_yen(case, field, value):
    case["expenses"][0][field] = value
    assert client.post("/v2/cases/evaluate", json=case).status_code == 422


def test_invalid_input_privacy(case):
    case["people"][0]["birth_date"] = "SECRET-BIRTH-DATE"
    response = client.post("/v2/cases/evaluate", json=case)
    assert response.status_code == 422
    assert "SECRET" not in response.text


def test_unknown_event_rejected(case):
    case["events"] = ["invented_rule"]
    assert client.post("/v2/cases/evaluate", json=case).status_code == 422


def test_21000_boundaries_and_grouping(case):
    case["income_category"] = "D"
    expense = case["expenses"][0]
    expense.update(
        patient_paid_yen=20999,
        receipt_patient_paid_yen=20999,
        total_medical_cost_yen=70000,
        receipt_total_medical_cost_yen=70000,
    )
    assert evaluate(case)["calculation_result"]["eligible_patient_paid_yen"] == 0
    expense.update(patient_paid_yen=21000, receipt_patient_paid_yen=21000)
    assert evaluate(case)["calculation_result"]["eligible_patient_paid_yen"] == 21000
    other = deepcopy(expense)
    other.update(
        expense_id="other",
        care_setting="outpatient",
        patient_paid_yen=20000,
        receipt_patient_paid_yen=20000,
    )
    case["expenses"].append(other)
    assert evaluate(case)["calculation_result"]["eligible_patient_paid_yen"] == 21000


def test_age_and_insurer_conflict(case):
    case["people"][0]["birth_date"] = "1956-07-01"
    result = evaluate(case)
    assert result["calculation_result"] is None
    assert "TURNING_70" in [e["code"] for e in result["exception_codes"]]


def test_different_insurer_requires_review(case):
    person = deepcopy(case["people"][0])
    person.update(person_id="other", insurer_id="other-insurer")
    case["people"].append(person)
    assert evaluate(case)["exception_codes"][0]["code"] == "DIFFERENT_INSURERS"


def test_external_adapter_is_unknown_by_default():
    import asyncio

    from app.workflow.external import MockEvidenceGateway

    evidence = asyncio.run(MockEvidenceGateway().fetch("fictional-case"))
    assert evidence.duplicate_application is None
    assert evidence.household_verified is None
