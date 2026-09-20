from app.models import IncomeCategory
from app.rules.common import LimitRule, PolicyTable

POLICY_NAME = "2026-08_to_2027-07"

RULES: PolicyTable = {
    IncomeCategory.A: LimitRule(270_300, 901_000, 140_100),
    IncomeCategory.B: LimitRule(179_100, 597_000, 93_000),
    IncomeCategory.C: LimitRule(85_800, 286_000, 44_400),
    IncomeCategory.D: LimitRule(61_500, None, 44_400),
    IncomeCategory.E: LimitRule(36_900, None, 24_600),
}
