import json
from datetime import date
from functools import lru_cache
from importlib.resources import files


class RuleSelectionError(ValueError):
    pass


@lru_cache
def load_rules() -> list[dict]:
    path = files("app.rules").joinpath("benefit_rules.json")
    return json.loads(path.read_text(encoding="utf-8"))["rules"]


@lru_cache
def load_pattern_support() -> list[dict]:
    path = files("app.rules").joinpath("pattern_support.json")
    return json.loads(path.read_text(encoding="utf-8"))["patterns"]


def select_rule(service_date: date, insurance_type: str, age: int, income_category: str) -> dict:
    matches = [
        rule
        for rule in load_rules()
        if rule["effective_from"] <= service_date.isoformat() <= rule["effective_to"]
        and insurance_type in rule["insurance_types"]
        and rule["age_condition"] == ("under_70" if age < 70 else "70_or_over")
        and rule["income_category"] == income_category
        and rule["confirmation_status"] == "official_guidance_verified"
    ]
    if len(matches) != 1:
        raise RuleSelectionError(f"expected exactly one executable rule, found {len(matches)}")
    return matches[0]
