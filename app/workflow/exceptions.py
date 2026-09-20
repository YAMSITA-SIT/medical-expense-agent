from calendar import monthrange
from datetime import date

from app.rules.selector import parse_month
from app.workflow.codes import EXCEPTION_RULES, OCR_MIN_CONFIDENCE
from app.workflow.codes import ExceptionCode as C
from app.workflow.models import CaseRequest, ExceptionFinding, Extracted


def detect_exceptions(case: CaseRequest) -> list[ExceptionFinding]:
    codes = set(case.events)
    if case.receipt_state == "pending":
        codes.add(C.RECEIPT_PENDING)
    if case.case_id in case.prior_application_ids:
        codes.add(C.DUPLICATE_APPLICATION)
    if case.correction_of_case_id:
        codes.add(C.CLAIM_ADJUSTED)
    people = {p.person_id: p for p in case.people}
    documents = {d.document_id: d for d in case.documents}
    if len(people) != len(case.people) or len(documents) != len(case.documents):
        codes.add(C.INPUT_CONFLICT)
    if case.primary_person_id and case.primary_person_id not in people:
        codes.add(C.INPUT_CONFLICT)
    if len({p.insurer_id for p in case.people if p.insurer_id}) > 1:
        codes.add(C.DIFFERENT_INSURERS)
    if len({p.benefit_household_id for p in case.people if p.benefit_household_id}) > 1:
        codes.add(C.INPUT_CONFLICT)
    month = parse_month(case.target_month or "")
    today = date.today()
    if month:
        first = date(*month, 1)
        last = date(*month, monthrange(*month)[1])
        active_insurers = {}
        for coverage in case.coverage_periods:
            if coverage.person_id not in people:
                codes.add(C.INPUT_CONFLICT)
            if coverage.valid_to and coverage.valid_to < coverage.valid_from:
                codes.add(C.INPUT_CONFLICT)
            overlaps = coverage.valid_from <= last and (
                coverage.valid_to is None or coverage.valid_to >= first
            )
            if not overlaps:
                continue
            active_insurers.setdefault(coverage.person_id, set()).add(coverage.insurer_id)
            if coverage.insurance_type == "elderly":
                codes.add(C.ELDERLY_INSURANCE_TRANSITION)
            if coverage.retroactive:
                codes.add(C.RETROACTIVE_ENROLLMENT)
            if first < coverage.valid_from <= last:
                codes.add(
                    C.NHI_JOINED_DURING_MONTH
                    if coverage.insurance_type == "nhi"
                    else C.INSURANCE_CHANGED_DURING_MONTH
                )
            if coverage.valid_to and first <= coverage.valid_to < last:
                codes.add(
                    C.NHI_LEFT_DURING_MONTH
                    if coverage.insurance_type == "nhi"
                    else C.INSURANCE_CHANGED_DURING_MONTH
                )
        for person_id, insurers in active_insurers.items():
            if len(insurers) > 1:
                codes.add(C.INSURANCE_CHANGED_DURING_MONTH)
            elif person_id in people and people[person_id].insurer_id not in insurers:
                codes.add(C.INPUT_CONFLICT)
        if month < (2018, 8) or month > (2027, 7) or month > (today.year, today.month):
            codes.add(C.PERIOD_UNSUPPORTED)
        for person in case.people:
            born = person.birth_date
            if born:
                if (born.year, born.month) > month:
                    codes.add(C.INPUT_CONFLICT)
                age = month[0] - born.year - (month[1] < born.month)
                # Adjacent month also routed to cover legal age attainment on day before birthday.
                for milestone, code in ((70, C.TURNING_70), (75, C.TURNING_75)):
                    target = (born.year + milestone, born.month)
                    previous = (target[0] - (target[1] == 1), (target[1] - 2) % 12 + 1)
                    if month in (target, previous):
                        codes.add(code)
                if age >= 70:
                    codes.add(C.AGE_UNSUPPORTED)
    seen_ids, seen_treatments = set(), set()
    for expense in case.expenses:
        if expense.expense_id in seen_ids:
            codes.add(C.DUPLICATE_TREATMENT)
        seen_ids.add(expense.expense_id)
        signature = (
            expense.person_id,
            expense.service_month,
            expense.provider_id,
            expense.care_setting,
            expense.discipline,
            expense.cost_type,
            expense.total_medical_cost_yen,
            expense.patient_paid_yen,
        )
        if signature in seen_treatments:
            codes.add(C.DUPLICATE_TREATMENT)
        seen_treatments.add(signature)
        if expense.person_id and expense.person_id not in people:
            codes.add(C.INPUT_CONFLICT)
        if expense.service_month and expense.service_month != case.target_month:
            codes.add(C.INPUT_CONFLICT)
        if expense.costs_separated is False:
            codes.add(C.COSTS_INSEPARABLE)
        if expense.cost_type and expense.insurance_covered is not None:
            if (expense.cost_type == "insured") != expense.insurance_covered:
                codes.add(C.INPUT_CONFLICT)
        paid, total = expense.patient_paid_yen, expense.total_medical_cost_yen
        if paid is not None and total is not None and paid > total:
            codes.add(C.INPUT_CONFLICT)
        for field in ("total_medical_cost_yen", "patient_paid_yen"):
            receipt_value = getattr(expense, "receipt_" + field)
            if receipt_value is not None and receipt_value != getattr(expense, field):
                codes.add(C.AMOUNT_MISMATCH)
        if expense.document_id:
            document = documents.get(expense.document_id)
            if not document or document.person_id != expense.person_id:
                codes.add(C.INPUT_CONFLICT)
            else:
                for field in (
                    "total_medical_cost_yen",
                    "patient_paid_yen",
                    "care_setting",
                    "discipline",
                ):
                    if getattr(document, field).value != getattr(expense, field):
                        codes.add(C.INPUT_CONFLICT)
                if document.service_month.value != expense.service_month:
                    codes.add(C.INPUT_CONFLICT)
    for document in case.documents:
        person = people.get(document.person_id)
        if not person or (
            document.birth_date.value and person.birth_date != document.birth_date.value
        ):
            codes.add(C.INPUT_CONFLICT)
        if not any(e.document_id == document.document_id for e in case.expenses):
            codes.add(C.INPUT_CONFLICT)
        for field in type(document).model_fields:
            extracted = getattr(document, field)
            if isinstance(extracted, Extracted) and extracted.value is not None:
                if not extracted.confirmed:
                    codes.add(C.DOCUMENT_UNCONFIRMED)
                    if extracted.confidence < OCR_MIN_CONFIDENCE:
                        codes.add(C.OCR_LOW_CONFIDENCE)
    return [
        ExceptionFinding(
            code=code,
            **{
                key: EXCEPTION_RULES[code][key] for key in ("category", "reason", "required_action")
            },
        )
        for code in sorted(codes)
    ]
