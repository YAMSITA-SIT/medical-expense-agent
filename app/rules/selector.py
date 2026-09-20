import re
from dataclasses import dataclass

from app.rules.common import PolicyTable
from app.rules.from_2026_08 import POLICY_NAME as CURRENT_NAME
from app.rules.from_2026_08 import RULES as CURRENT_RULES
from app.rules.until_2026_07 import POLICY_NAME as LEGACY_NAME
from app.rules.until_2026_07 import RULES as LEGACY_RULES


@dataclass(frozen=True)
class SelectedPolicy:
    name: str
    rules: PolicyTable


def parse_month(value: str) -> tuple[int, int] | None:
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", value):
        return None
    year, month = value.split("-")
    return int(year), int(month)


def select_policy(target_month: str) -> SelectedPolicy | None:
    parsed = parse_month(target_month)
    if parsed is None:
        return None
    if (2015, 1) <= parsed <= (2026, 7):
        return SelectedPolicy(LEGACY_NAME, LEGACY_RULES)
    if (2026, 8) <= parsed <= (2027, 7):
        return SelectedPolicy(CURRENT_NAME, CURRENT_RULES)
    return None
