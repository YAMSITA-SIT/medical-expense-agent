import json
from collections import defaultdict

from app.models import EvaluationRequest, ExpenseUnit
from app.rules.metadata import WORKFLOW_RULES
from app.rules.selector import select_policy
from app.services.evaluator import evaluate
from app.workflow.models import CaseRequest
from app.workflow.privacy import mask_sensitive


def calculation_input(case: CaseRequest) -> EvaluationRequest:
    people = {p.person_id: p for p in case.people}
    year, month = map(int, case.target_month.split("-"))

    def age(person_id: str) -> int:
        birth = people[person_id].birth_date
        return year - birth.year - (month < birth.month)

    primary = people[case.primary_person_id]
    return EvaluationRequest(
        target_month=case.target_month,
        primary_person_id=case.primary_person_id,
        primary_age=age(case.primary_person_id),
        insurer_id=primary.insurer_id,
        income_category=case.income_category,
        high_cost_benefit_count_previous_12_months=case.high_cost_benefit_count_previous_12_months,
        expenses=[
            ExpenseUnit(
                person_id=e.person_id,
                age=age(e.person_id),
                insurer_id=people[e.person_id].insurer_id,
                calculation_unit_id=json.dumps([e.provider_id, e.discipline, e.care_setting]),
                insurance_covered=e.insurance_covered,
                total_medical_cost_yen=e.total_medical_cost_yen,
                patient_paid_yen=e.patient_paid_yen,
            )
            for e in case.expenses
        ],
    )


def requires_rounding_review(case: CaseRequest) -> bool:
    request = calculation_input(case)
    if request.high_cost_benefit_count_previous_12_months >= 3:
        return False
    units = defaultdict(lambda: [0, 0])
    for expense in request.expenses:
        if expense.insurance_covered:
            key = (expense.person_id, expense.calculation_unit_id)
            units[key][0] += expense.patient_paid_yen
            units[key][1] += expense.total_medical_cost_yen
    total = sum(total for paid, total in units.values() if paid >= 21000)
    rule = select_policy(request.target_month).rules[request.income_category]
    return rule.threshold_yen is not None and max(0, total - rule.threshold_yen) % 100 != 0


def calculate(case: CaseRequest) -> dict:
    result = evaluate(calculation_input(case))
    if result.status != "calculated":
        raise ValueError("preflight contract violated")
    return {
        "scheme": "高額療養費（70歳未満・月額概算）",
        "eligible_medical_cost_yen": sum(u.total_medical_cost_yen for u in result.included_units),
        "eligible_patient_paid_yen": sum(u.patient_paid_yen for u in result.included_units),
        "excluded_patient_paid_yen": sum(u["patient_paid_yen"] for u in result.excluded_units),
        "excluded_units": result.excluded_units,
        "eligibility_possibility": result.eligibility_possibility,
        "self_payment_limit_yen": result.self_payment_limit_yen,
        "estimated_refund_yen": result.estimated_refund_yen,
        "calculation_formula": result.calculation_formula,
        "calculation_steps": result.calculation_steps,
        "applied_rules": {**WORKFLOW_RULES, "policy_period": result.applied_policy_period},
        "used_inputs": mask_sensitive(case.model_dump(mode="json")),
        "reasons": result.reasons,
        "additional_checks": ["保険者の最終審査", "年間上限は別途確認", "既払額・現物給付との調整"],
        "notice": "最終的な支給可否・金額は保険者が決定します。",
    }
