import json
from pathlib import Path

from app.workflow.models import CaseRequest
from app.workflow.service import process


def test_history_detects_midmonth_change_without_event_flag():
    data = json.loads(Path("examples/workflow_case.json").read_text())
    data["coverage_periods"] = [
        {
            "person_id": "fictional-person-1",
            "insurer_id": "old",
            "insurance_type": "nhi",
            "valid_from": "2020-01-01",
            "valid_to": "2026-07-14",
        },
        {
            "person_id": "fictional-person-1",
            "insurer_id": "fictional-insurer",
            "insurance_type": "employee",
            "valid_from": "2026-07-15",
        },
    ]
    result = process(CaseRequest.model_validate(data), calculate_now=True)
    assert result.status == "manual_review_required"
    assert "INSURANCE_CHANGED_DURING_MONTH" in [f.code for f in result.exception_codes]
    assert result.calculation_result is None


def test_unchanged_coverage_can_calculate():
    data = json.loads(Path("examples/workflow_case.json").read_text())
    data["coverage_periods"] = [
        {
            "person_id": "fictional-person-1",
            "insurer_id": "fictional-insurer",
            "insurance_type": "employee",
            "valid_from": "2020-01-01",
        },
    ]
    assert process(CaseRequest.model_validate(data)).status == "ready_for_calculation"
