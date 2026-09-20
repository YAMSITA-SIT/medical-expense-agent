from app.models import IncomeCategory
from app.rules.common import LimitRule, PolicyTable

POLICY_NAME = "2015-01_to_2026-07"

RULES: PolicyTable = {
    IncomeCategory.A: LimitRule(252_600, 842_000, 140_100),
    IncomeCategory.B: LimitRule(167_400, 558_000, 93_000),
    IncomeCategory.C: LimitRule(80_100, 267_000, 44_400),
    IncomeCategory.D: LimitRule(57_600, None, 44_400),
    IncomeCategory.E: LimitRule(35_400, None, 24_600),
}
