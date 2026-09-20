from collections import defaultdict
from typing import Any

from app.models import (
    EvaluationRequest,
    EvaluationResponse,
    ExpenseUnit,
    IncludedUnit,
    MissingInformation,
)
from app.rules.selector import parse_month, select_policy

MINIMUM_UNIT_PAYMENT_YEN = 21_000
STANDARD_CAUTIONS = [
    "この結果は架空データまたは利用者入力に基づく概算です。",
    "最終的な支給可否と支給額は、加入している健康保険者が決定します。",
    "差額ベッド代、入院時食事療養費などの保険適用外費用は対象外です。",
    "70歳以上、特定疾病、年間上限および2027年8月以降の制度は未対応です。",
]


def _missing(request: EvaluationRequest) -> list[MissingInformation]:
    result: list[MissingInformation] = []
    required = {
        "target_month": (request.target_month, "適用する制度期間を選ぶため必要です"),
        "primary_person_id": (request.primary_person_id, "本人を識別するため必要です"),
        "primary_age": (request.primary_age, "70歳未満の対象か確認するため必要です"),
        "insurer_id": (request.insurer_id, "同一保険者の世帯合算を判定するため必要です"),
        "income_category": (request.income_category, "自己負担限度額を選ぶため必要です"),
        "high_cost_benefit_count_previous_12_months": (
            request.high_cost_benefit_count_previous_12_months,
            "多数回該当を判定するため必要です",
        ),
        "expenses": (request.expenses, "医療費を計算するため必要です"),
    }
    for field, (value, reason) in required.items():
        if value is None:
            result.append(MissingInformation(field=field, reason=reason))
    if request.expenses is not None and not request.expenses:
        result.append(MissingInformation(field="expenses", reason="1件以上必要です"))
    for index, expense in enumerate(request.expenses or []):
        for field in (
            "person_id",
            "age",
            "insurer_id",
            "calculation_unit_id",
            "insurance_covered",
            "total_medical_cost_yen",
            "patient_paid_yen",
        ):
            if getattr(expense, field) is None:
                result.append(
                    MissingInformation(
                        field=f"expenses[{index}].{field}",
                        reason="計算単位の対象判定と金額計算に必要です",
                    )
                )
    return result


def _base_response(
    status: str,
    request: EvaluationRequest,
    *,
    reasons: list[str],
    missing: list[MissingInformation] | None = None,
) -> EvaluationResponse:
    return EvaluationResponse(
        status=status,
        eligibility_possibility=None,
        self_payment_limit_yen=None,
        estimated_refund_yen=None,
        applied_policy_period=None,
        multiple_occurrence_applied=None,
        used_inputs=request.model_dump(mode="json"),
        included_units=[],
        excluded_units=[],
        calculation_formula=None,
        calculation_steps=[],
        reasons=reasons,
        missing_information=missing or [],
        cautions=STANDARD_CAUTIONS,
    )


def evaluate(request: EvaluationRequest) -> EvaluationResponse:
    missing = _missing(request)
    if missing:
        return _base_response(
            "additional_information_required",
            request,
            reasons=["必要な入力が不足しているため、推測せず計算を停止しました。"],
            missing=missing,
        )

    assert request.target_month is not None
    assert request.primary_age is not None
    assert request.insurer_id is not None
    assert request.income_category is not None
    assert request.high_cost_benefit_count_previous_12_months is not None
    assert request.expenses is not None

    if parse_month(request.target_month) is None:
        return _base_response(
            "additional_information_required",
            request,
            reasons=["target_monthはYYYY-MM形式で入力してください。"],
            missing=[MissingInformation(field="target_month", reason="有効な対象診療月が必要です")],
        )
    if request.primary_age >= 70 or any((expense.age or 0) >= 70 for expense in request.expenses):
        return _base_response(
            "unsupported",
            request,
            reasons=["このMVPは70歳未満の医療費だけを対象としています。"],
        )

    policy = select_policy(request.target_month)
    if policy is None:
        return _base_response(
            "unsupported",
            request,
            reasons=["対象診療月に対応する確定済みルールを実装していないため計算しません。"],
        )

    grouped: dict[tuple[str, str], dict[str, int]] = defaultdict(
        lambda: {"patient_paid_yen": 0, "total_medical_cost_yen": 0}
    )
    excluded: list[dict[str, Any]] = []
    for expense in request.expenses:
        if not expense.insurance_covered:
            excluded.append(_excluded(expense, "保険適用外費用のため除外"))
            continue
        if expense.insurer_id != request.insurer_id:
            excluded.append(_excluded(expense, "本人と異なる保険者のため世帯合算から除外"))
            continue
        assert expense.person_id is not None
        assert expense.calculation_unit_id is not None
        assert expense.patient_paid_yen is not None
        assert expense.total_medical_cost_yen is not None
        key = (expense.person_id, expense.calculation_unit_id)
        grouped[key]["patient_paid_yen"] += expense.patient_paid_yen
        grouped[key]["total_medical_cost_yen"] += expense.total_medical_cost_yen

    included: list[IncludedUnit] = []
    for (person_id, unit_id), amounts in grouped.items():
        if amounts["patient_paid_yen"] < MINIMUM_UNIT_PAYMENT_YEN:
            excluded.append(
                {
                    "person_id": person_id,
                    "calculation_unit_id": unit_id,
                    **amounts,
                    "reason": "計算単位の自己負担額が21,000円未満のため除外",
                }
            )
            continue
        included.append(
            IncludedUnit(
                calculation_unit_id=unit_id,
                person_id=person_id,
                patient_paid_yen=amounts["patient_paid_yen"],
                total_medical_cost_yen=amounts["total_medical_cost_yen"],
            )
        )

    total_paid = sum(unit.patient_paid_yen for unit in included)
    total_medical_cost = sum(unit.total_medical_cost_yen for unit in included)
    rule = policy.rules[request.income_category]
    frequent = request.high_cost_benefit_count_previous_12_months >= 3
    normal_limit = rule.normal_limit(total_medical_cost)
    limit = rule.frequent_yen if frequent else normal_limit
    refund = max(0, total_paid - limit)

    formula = f"多数回該当限度額 {rule.frequent_yen:,}円" if frequent else rule.formula
    steps = [
        f"21,000円基準を満たす計算単位の自己負担額合計: {total_paid:,}円",
        f"対応する保険適用総医療費合計（10割）: {total_medical_cost:,}円",
        f"所得区分{request.income_category.value}の限度額: {limit:,}円",
        f"max(0, {total_paid:,}円 - {limit:,}円) = {refund:,}円",
    ]
    reasons = [
        "70歳未満で、同一保険者の同一月の医療費を世帯合算しました。",
        "保険適用外費用と21,000円未満の計算単位は除外しました。",
    ]
    if frequent:
        reasons.append("直近12か月の該当回数が3回以上のため、多数回該当を適用しました。")
    else:
        reasons.append("直近12か月の該当回数が3回未満のため、通常限度額を適用しました。")

    return EvaluationResponse(
        status="calculated",
        eligibility_possibility=refund > 0,
        self_payment_limit_yen=limit,
        estimated_refund_yen=refund,
        applied_policy_period=policy.name,
        multiple_occurrence_applied=frequent,
        used_inputs=request.model_dump(mode="json"),
        included_units=included,
        excluded_units=excluded,
        calculation_formula=formula,
        calculation_steps=steps,
        reasons=reasons,
        missing_information=[],
        cautions=STANDARD_CAUTIONS,
    )


def _excluded(expense: ExpenseUnit, reason: str) -> dict[str, Any]:
    return {**expense.model_dump(mode="json"), "reason": reason}
