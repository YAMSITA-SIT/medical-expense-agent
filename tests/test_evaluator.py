from app.models import EvaluationRequest
from app.services.evaluator import evaluate


def request_with(expenses: list[dict], **overrides: object) -> EvaluationRequest:
    data = {
        "target_month": "2026-09",
        "primary_person_id": "p1",
        "primary_age": 45,
        "insurer_id": "i1",
        "income_category": "D",
        "high_cost_benefit_count_previous_12_months": 0,
        "expenses": expenses,
    }
    data.update(overrides)
    return EvaluationRequest.model_validate(data)


def unit(
    unit_id: str,
    paid: int,
    total: int,
    *,
    person: str = "p1",
    insurer: str = "i1",
    covered: bool = True,
) -> dict:
    return {
        "person_id": person,
        "age": 45,
        "insurer_id": insurer,
        "calculation_unit_id": unit_id,
        "insurance_covered": covered,
        "total_medical_cost_yen": total,
        "patient_paid_yen": paid,
    }


def test_household_aggregation() -> None:
    result = evaluate(
        request_with(
            [
                unit("hospital-a", 60_000, 200_000),
                unit("hospital-b", 90_000, 300_000, person="family"),
            ]
        )
    )
    assert result.status == "calculated"
    assert result.self_payment_limit_yen == 61_500
    assert result.estimated_refund_yen == 88_500


def test_units_are_aggregated_before_21000_threshold() -> None:
    result = evaluate(
        request_with([unit("same-unit", 11_000, 40_000), unit("same-unit", 12_000, 40_000)])
    )
    assert len(result.included_units) == 1
    assert result.included_units[0].patient_paid_yen == 23_000


def test_below_21000_and_noncovered_are_excluded() -> None:
    result = evaluate(
        request_with(
            [
                unit("small", 20_999, 70_000),
                unit("private-room", 50_000, 50_000, covered=False),
            ]
        )
    )
    assert result.estimated_refund_yen == 0
    assert len(result.excluded_units) == 2


def test_different_insurer_is_excluded() -> None:
    result = evaluate(
        request_with(
            [
                unit("own", 70_000, 240_000),
                unit("other", 100_000, 340_000, person="family", insurer="i2"),
            ]
        )
    )
    assert result.estimated_refund_yen == 8_500
    assert any("異なる保険者" in item["reason"] for item in result.excluded_units)


def test_multiple_occurrence_uses_reduced_limit() -> None:
    result = evaluate(
        request_with(
            [unit("hospital", 150_000, 500_000)],
            high_cost_benefit_count_previous_12_months=3,
        )
    )
    assert result.multiple_occurrence_applied is True
    assert result.self_payment_limit_yen == 44_400
    assert result.estimated_refund_yen == 105_600


def test_legacy_policy_is_selected_by_month() -> None:
    result = evaluate(
        request_with(
            [unit("hospital", 300_000, 1_000_000)],
            target_month="2026-07",
            income_category="C",
        )
    )
    assert result.applied_policy_period == "2015-01_to_2026-07"
    assert result.self_payment_limit_yen == 87_430


def test_missing_information_stops_calculation() -> None:
    result = evaluate(
        EvaluationRequest(
            target_month="2026-09",
            primary_person_id="p1",
            primary_age=45,
            insurer_id="i1",
            income_category=None,
            high_cost_benefit_count_previous_12_months=0,
            expenses=[],
        )
    )
    assert result.status == "additional_information_required"
    assert result.estimated_refund_yen is None
    assert {item.field for item in result.missing_information} == {"income_category", "expenses"}


def test_age_70_or_over_is_unsupported() -> None:
    result = evaluate(request_with([unit("hospital", 100_000, 340_000)], primary_age=70))
    assert result.status == "unsupported"


def test_future_policy_is_not_assumed() -> None:
    result = evaluate(request_with([unit("hospital", 100_000, 340_000)], target_month="2027-08"))
    assert result.status == "unsupported"
