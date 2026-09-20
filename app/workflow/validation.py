from app.rules.selector import parse_month
from app.workflow.models import CaseRequest, Missing


def missing_information(case: CaseRequest) -> list[Missing]:
    missing = []

    def require(field: str, value: object, reason: str) -> None:
        if value is None or value == "" or value == []:
            missing.append(
                Missing(field=field, reason=reason, question=f"{field}を確認して入力してください")
            )

    for field, reason in {
        "target_month": "制度の適用期間を選択するため必要です",
        "primary_person_id": "申請対象者を特定するため必要です",
        "income_category": "自己負担限度額を選択できないため必要です",
        "high_cost_benefit_count_previous_12_months": "多数回該当を判定するため必要です",
        "people": "年齢・資格・世帯を確認するため必要です",
        "expenses": "金額計算に必要です",
        "receipt_state": "レセプト到着状況を確認するため必要です",
    }.items():
        require(field, getattr(case, field), reason)
    if case.target_month and parse_month(case.target_month) is None:
        require("target_month", None, "YYYY-MM形式の有効な診療月が必要です")
    for field in (
        "exception_screening_completed",
        "household_verified",
        "benefit_history_verified",
    ):
        if getattr(case, field) is not True:
            require(field, None, "未確認を例外なしと推測できないため確認が必要です")
    for i, person in enumerate(case.people):
        for field in ("birth_date", "insurer_id", "benefit_household_id"):
            require(f"people[{i}].{field}", getattr(person, field), "年齢と世帯合算資格に必要です")
    for i, expense in enumerate(case.expenses):
        for field in (
            "person_id",
            "service_month",
            "provider_id",
            "care_setting",
            "discipline",
            "insurance_covered",
            "cost_type",
            "total_medical_cost_yen",
            "patient_paid_yen",
            "costs_separated",
        ):
            require(f"expenses[{i}].{field}", getattr(expense, field), "計算単位の確認に必要です")
        if case.receipt_state == "received" and expense.insurance_covered:
            for field in ("receipt_total_medical_cost_yen", "receipt_patient_paid_yen"):
                require(
                    f"expenses[{i}].{field}",
                    getattr(expense, field),
                    "同じ診療範囲・負担区分のレセプト照合値が必要です",
                )
    for i, document in enumerate(case.documents):
        require(f"documents[{i}].person_id", document.person_id, "書類と受診者の対応が必要です")
        for field in (
            "birth_date",
            "service_month",
            "provider_name",
            "total_medical_cost_yen",
            "patient_paid_yen",
            "care_setting",
            "discipline",
        ):
            require(
                f"documents[{i}].{field}.value",
                getattr(document, field).value,
                "書類の計算関連項目が不足しています",
            )
    return missing
