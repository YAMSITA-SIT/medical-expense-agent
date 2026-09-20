from app.workflow.calculation import calculate, requires_rounding_review
from app.workflow.codes import EXCEPTION_RULES, STATUS_OVERRIDES, STATUS_PRIORITY, ExceptionCode
from app.workflow.codes import Status as S
from app.workflow.exceptions import detect_exceptions
from app.workflow.models import CaseRequest, CaseResponse, ExceptionFinding
from app.workflow.validation import missing_information


def process(case: CaseRequest, *, calculate_now: bool = False) -> CaseResponse:
    missing = missing_information(case)
    findings = detect_exceptions(case)
    if not missing and not findings and requires_rounding_review(case):
        code = ExceptionCode.ROUNDING_UNVERIFIED
        findings.append(
            ExceptionFinding(
                code=code,
                **{
                    key: EXCEPTION_RULES[code][key]
                    for key in ("category", "reason", "required_action")
                },
            )
        )
    if findings:
        statuses = {STATUS_OVERRIDES.get(f.code, S.REVIEW) for f in findings}
        status = next(s for s in STATUS_PRIORITY if s in statuses)
    elif missing:
        status = S.MISSING
    else:
        status = S.COMPLETED if calculate_now else S.READY
    return CaseResponse(
        case_id=case.case_id,
        status=status,
        missing_information=missing,
        exception_codes=findings,
        calculation_result=calculate(case) if status == S.COMPLETED else None,
        next_action={
            S.READY: "同じ確認済みJSONを/v2/cases/evaluateへ送信してください",
            S.COMPLETED: "概算結果を次工程へ渡し、保険者の最終審査を受けてください",
            S.MISSING: "不足項目を確認・補完して再送してください",
            S.PENDING: "レセプト到着後に金額を照合して再送してください",
            S.DUPLICATE: "職員が重複と支給履歴を確認してください",
            S.RECALCULATE: "職員が訂正内容と既払額を確認して再計算してください",
            S.REVIEW: "職員がすべての例外を確認してください",
            S.UNSUPPORTED: "対応制度を扱う保険者・職員へ引き継いでください",
        }[status],
    )
