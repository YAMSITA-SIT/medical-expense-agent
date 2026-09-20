from enum import StrEnum


class Status(StrEnum):
    READY = "ready_for_calculation"
    MISSING = "additional_information_required"
    REVIEW = "manual_review_required"
    COMPLETED = "calculation_completed"
    PENDING = "pending_receipt"
    DUPLICATE = "duplicate_suspected"
    RECALCULATE = "recalculation_required"
    UNSUPPORTED = "unsupported_case"


# These are conservative PoC routing rules, NOT statutory eligibility decisions.
# code, category, reason. All known events must be disclosed by the caller.
_ROWS = """
NHI_JOINED_DURING_MONTH|eligibility|月途中の国保加入
NHI_LEFT_DURING_MONTH|eligibility|月途中の国保脱退
RETROACTIVE_ENROLLMENT|eligibility|遡及加入
RETROACTIVE_LOSS|eligibility|遡及喪失
MOVED_DURING_MONTH|eligibility|月途中の市区町村間転居
INSURANCE_CHANGED_DURING_MONTH|eligibility|対象月の途中で加入保険が変更されています
TURNING_70|eligibility|70歳到達月
TURNING_75|eligibility|75歳到達月
ELDERLY_INSURANCE_TRANSITION|eligibility|後期高齢者医療への切替
HOUSEHOLD_HEAD_CHANGED|eligibility|世帯主変更
HOUSEHOLD_SPLIT|eligibility|世帯分離
HOUSEHOLD_MERGED|eligibility|世帯合併
DIFFERENT_INSURERS|eligibility|世帯内の保険者が異なります
DECEASED_BEFORE_APPLICATION|eligibility|申請前に被保険者が死亡
RECEIPT_PENDING|receipt|レセプトが未到着
LATE_CLAIM|receipt|月遅れ請求
CLAIM_RETURNED|receipt|レセプト返戻
CLAIM_RESUBMITTED|receipt|再請求
CLAIM_ASSESSED|receipt|査定
CLAIM_ADJUSTED|receipt|過誤調整
DUPLICATE_TREATMENT|receipt|同一診療の重複データの可能性
AMOUNT_MISMATCH|receipt|領収書と明細・レセプトの金額不一致
PROVIDER_UNKNOWN|receipt|医療機関を特定できません
MONTH_UNKNOWN|receipt|診療年月を特定できません
COSTS_INSEPARABLE|receipt|保険診療分と対象外費用を分離できません
HOME_NURSING|receipt|訪問看護
MEDICAL_REIMBURSEMENT|receipt|療養費
JUDO_THERAPY|receipt|柔道整復
ORTHOTIC_DEVICE|receipt|治療用装具
LOCAL_SUBSIDY|coordination|自治体独自助成
CHILD_SUBSIDY|coordination|子ども医療
SINGLE_PARENT_SUBSIDY|coordination|ひとり親医療
DISABILITY_SUBSIDY|coordination|障害者医療
INTRACTABLE_DISEASE|coordination|指定難病
PEDIATRIC_CHRONIC_DISEASE|coordination|小児慢性特定疾病
PUBLIC_FUNDING|coordination|公費負担医療
WORKERS_COMPENSATION|coordination|労災保険
THIRD_PARTY_INJURY|coordination|第三者行為・交通事故
AUTO_LIABILITY_INSURANCE|coordination|自賠責保険
PUBLIC_ASSISTANCE|coordination|生活保護
SPECIFIED_DISEASE|coordination|特定疾病療養受療証
MEDICAL_CARE_COMBINED|coordination|高額医療・高額介護合算
INCOME_UNKNOWN|income|所得区分不明
INCOME_UNDECLARED|income|所得未申告
TAX_DATA_UNAVAILABLE|income|住民税情報を取得できません
PREVIOUS_ADDRESS_INQUIRY|income|前住所地への所得照会が必要
TAX_CORRECTED|income|税情報が更正されました
FREQUENCY_UNKNOWN|income|多数回該当回数を確認できません
PROXY_APPLICATION|application|代理人申請
GUARDIAN_APPLICATION|application|成年後見人申請
HEIR_APPLICATION|application|相続人申請
DUPLICATE_APPLICATION|application|重複申請の可能性
ALREADY_PAID|application|すでに支給済み
DEADLINE_POSSIBLY_EXPIRED|application|申請期限超過の可能性
BANK_ACCOUNT_MISMATCH|application|振込口座情報の不一致
OCR_LOW_CONFIDENCE|document|OCR信頼度が基準未満です
DOCUMENT_UNCONFIRMED|document|抽出結果が未確認です
INPUT_CONFLICT|document|入力情報に矛盾があります
AGE_UNSUPPORTED|eligibility|70歳以上はPoC対象外です
PERIOD_UNSUPPORTED|eligibility|検証済みの対象診療月ではありません
ROUNDING_UNVERIFIED|calculation|この制度期間の端数処理を確定できません
UNKNOWN_CONDITION|application|自動処理できる根拠を確認できません
""".strip().splitlines()

ExceptionCode = StrEnum("ExceptionCode", {row.split("|")[0]: row.split("|")[0] for row in _ROWS})

EXCEPTION_RULES = {
    ExceptionCode(code): {
        "category": category,
        "reason": reason,
        "required_action": f"職員が「{reason}」の原資料・資格・支給履歴を確認してください",
        "source_kind": "poc_safety_policy",
        "rule_version": "2026-09-20",
    }
    for code, category, reason in (row.split("|") for row in _ROWS)
}

STATUS_OVERRIDES = {
    ExceptionCode.RECEIPT_PENDING: Status.PENDING,
    ExceptionCode.DUPLICATE_TREATMENT: Status.DUPLICATE,
    ExceptionCode.DUPLICATE_APPLICATION: Status.DUPLICATE,
    ExceptionCode.TAX_CORRECTED: Status.RECALCULATE,
    ExceptionCode.CLAIM_ADJUSTED: Status.RECALCULATE,
    ExceptionCode.CLAIM_RESUBMITTED: Status.RECALCULATE,
    ExceptionCode.AGE_UNSUPPORTED: Status.UNSUPPORTED,
    ExceptionCode.PERIOD_UNSUPPORTED: Status.UNSUPPORTED,
}

# All exceptions are returned; this ordering only chooses the primary status.
STATUS_PRIORITY = [
    Status.DUPLICATE,
    Status.RECALCULATE,
    Status.REVIEW,
    Status.UNSUPPORTED,
    Status.PENDING,
]
OCR_MIN_CONFIDENCE = 0.90  # PoC operational threshold, not a statutory rule.
