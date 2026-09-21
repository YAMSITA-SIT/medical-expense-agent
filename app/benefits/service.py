import re
from calendar import monthrange
from datetime import date

from app.benefits.models import (
    AppliedRule,
    BenefitEvaluationRequest,
    BenefitEvaluationResponse,
    HouseholdExpense,
)
from app.benefits.rule_store import RuleSelectionError, select_rule
from app.models import EvaluationRequest, ExpenseUnit
from app.services.evaluator import evaluate

LOW_CONFIDENCE = 0.90
REVIEW_FLAGS = {
    "public_funding": "公費負担は認定証・対象診療・給付調整の確認が必要です。",
    "psychiatric_outpatient": "精神通院医療は受給者証・指定医療機関・有効期間が必要です。",
    "workers_compensation": "労災との給付調整は人による確認が必要です。",
    "third_party_injury": "第三者行為の損害賠償・給付調整を確認してください。",
    "supplementary_benefit": "健保・共済ごとの付加給付規程が未登録です。",
    "specified_disease": "特定疾病療養受療証と対象診療の確認が必要です。",
    "overseas_care": "海外療養費の国内認定額・換算日・換算率の保険者決定が必要です。",
    "orthotic_device": "治療用装具の保険者認定額が必要です。",
    "annual_cap": "年間上限は12か月台帳と所得・保険変更時の配分確認が必要です。",
    "insurance_changed_during_month": "保険変更前後を資格期間別に分ける必要があります。",
    "turned_75_during_month": "75歳到達月の特例は現行Python計算層では未対応です。",
}


def _age(request: BenefitEvaluationRequest, when: date | None) -> int | None:
    if request.patient.age is not None:
        return request.patient.age
    if request.patient.birth_date and when:
        born = request.patient.birth_date
        return when.year - born.year - ((when.month, when.day) < (born.month, born.day))
    return None


def _service_date(request: BenefitEvaluationRequest) -> date | None:
    if request.service_date:
        return request.service_date
    if request.service_month and re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", request.service_month):
        year, month = map(int, request.service_month.split("-"))
        return date(year, month, monthrange(year, month)[1])
    return None


def _missing(request: BenefitEvaluationRequest, when: date | None, age: int | None) -> list[str]:
    required = {
        "patient.person_id": request.patient.person_id,
        "patient.birth_date_or_age": age,
        "service_date_or_month": when,
        "insurance.type": request.insurance.type,
        "insurance.insurer_number": request.insurance.insurer_number,
        "income.category": request.income.category,
        "costs.total_medical_cost_yen": request.costs.total_medical_cost_yen,
        "costs.insurance_covered_cost_yen": request.costs.insurance_covered_cost_yen,
        "costs.patient_paid_yen": request.costs.patient_paid_yen,
        "costs.uninsured_cost_yen": request.costs.uninsured_cost_yen,
        "care.setting": request.care.setting,
        "care.discipline": request.care.discipline,
        "care.provider_id": request.care.provider_id,
        "prior_12_month_benefit_months": request.prior_12_month_benefit_months,
        "special_cases.screening_completed": request.special_cases.screening_completed,
    }
    return [key for key, value in required.items() if value is None]


def _response(status: str, *, missing: list[str] | None = None, warnings: list[str] | None = None):
    return BenefitEvaluationResponse(
        status=status,
        missing_fields=missing or [],
        warnings=warnings or [],
        calculation=None,
        needs_human_review=status != "calculated",
    )


def evaluate_benefits(request: BenefitEvaluationRequest) -> BenefitEvaluationResponse:
    when = _service_date(request)
    age = _age(request, when)
    missing = _missing(request, when, age)
    low_confidence = sorted(k for k, v in request.ocr_confidence.items() if v < LOW_CONFIDENCE)
    if low_confidence:
        missing.extend(f"confirmed_fields.{key}" for key in low_confidence)
    if missing:
        return _response(
            "additional_information_required",
            missing=sorted(set(missing)),
            warnings=["不足値やOCR低信頼度値を推測せず計算を停止しました。"],
        )

    assert when and age is not None and request.patient.person_id
    assert request.insurance.type and request.insurance.insurer_number
    assert request.income.category and request.prior_12_month_benefit_months is not None
    assert request.care.provider_id and request.care.setting and request.care.discipline
    assert request.costs.total_medical_cost_yen is not None
    assert request.costs.insurance_covered_cost_yen is not None
    assert request.costs.patient_paid_yen is not None
    assert request.costs.uninsured_cost_yen is not None

    special = [
        message
        for field, message in REVIEW_FLAGS.items()
        if getattr(request.special_cases, field)
    ]
    if special:
        return _response("human_review_required", warnings=special)
    if age >= 70 or request.insurance.type == "elderly":
        return _response(
            "unsupported",
            warnings=["70歳以上の月額計算は現行Python計算層へ未移植のため計算しません。"],
        )
    cost_parts = request.costs.insurance_covered_cost_yen + request.costs.uninsured_cost_yen
    if cost_parts != request.costs.total_medical_cost_yen:
        return _response("human_review_required", warnings=["総医療費の内訳が一致しません。"])
    if request.costs.patient_paid_yen > request.costs.total_medical_cost_yen:
        return _response("human_review_required", warnings=["患者負担額が総医療費を超えています。"])

    month = when.strftime("%Y-%m")
    expenses = [
        HouseholdExpense(
            person_id=request.patient.person_id,
            age=age,
            insurer_number=request.insurance.insurer_number,
            provider_id=request.care.provider_id,
            setting=request.care.setting,
            discipline=request.care.discipline,
            total_medical_cost_yen=request.costs.insurance_covered_cost_yen,
            patient_paid_yen=request.costs.patient_paid_yen,
            insurance_covered=True,
        ),
        *request.household_expenses,
    ]
    try:
        rule = select_rule(when, request.insurance.type, age, request.income.category.value)
    except RuleSelectionError as exc:
        return _response("human_review_required", warnings=[str(exc)])

    result = evaluate(
        EvaluationRequest(
            target_month=month,
            primary_person_id=request.patient.person_id,
            primary_age=age,
            insurer_id=request.insurance.insurer_number,
            income_category=request.income.category,
            high_cost_benefit_count_previous_12_months=len(set(request.prior_12_month_benefit_months)),
            expenses=[
                ExpenseUnit(
                    person_id=e.person_id,
                    age=e.age,
                    insurer_id=e.insurer_number,
                    calculation_unit_id="|".join([e.provider_id, e.discipline, e.setting]),
                    insurance_covered=e.insurance_covered,
                    total_medical_cost_yen=e.total_medical_cost_yen,
                    patient_paid_yen=e.patient_paid_yen,
                )
                for e in expenses
            ],
        )
    )
    if result.status != "calculated":
        return _response("human_review_required", warnings=result.reasons)
    applied = AppliedRule(
        rule_id=rule["rule_id"], effective_from=rule["effective_from"],
        effective_to=rule["effective_to"], formula=result.calculation_formula or "",
        source_document=rule["source_document"], source_article=rule["source_article"],
        source_url=rule["source_url"], confirmation_status=rule["confirmation_status"],
    )
    return BenefitEvaluationResponse(
        status="calculated",
        applicable_programs=["high_cost_medical_expense"],
        calculation={
            "eligible_medical_cost": sum(x.total_medical_cost_yen for x in result.included_units),
            "patient_payment": sum(x.patient_paid_yen for x in result.included_units),
            "self_payment_limit": result.self_payment_limit_yen,
            "estimated_benefit": result.estimated_refund_yen,
            "currency": "JPY",
        },
        applied_rules=[applied],
        warnings=["最終的な支給可否と金額は加入する保険者が決定します。"],
        needs_human_review=False,
    )
