from datetime import date
import json
import math
from pathlib import Path


def load_benefit_rules():
  """benefit_rules.json から最新のルール定義を読み込む"""
  rule_path = Path(__file__).parent.parent / "rules" / "benefit_rules.json"
  if not rule_path.exists():
    rule_path = Path("app/rules/benefit_rules.json")

  with open(rule_path, "r", encoding="utf-8") as f:
    data = json.load(f)
  return data.get("rules", [])


py_safe_dict = {"floor": math.floor, "max": max, "min": min}


def calculate_exact_limit(
    target_date: date,
    age_under_70: bool,
    income_category: str,
    eligible_medical_cost: float,
    is_frequent: bool = False,
):
  """指定された条件に一致する公式ルールを適用し、正確な自己負担限度額を算出する"""
  rules = load_benefit_rules()
  matched_rule = None

  for rule in rules:
    from_date = date.fromisoformat(rule["effective_from"])
    to_date = date.fromisoformat(rule["effective_to"])

    if from_date <= target_date <= to_date:
      cond_age = "under_70" if age_under_70 else "over_70"
      if (
          rule["age_condition"] == cond_age
          and rule["income_category"].upper() == income_category.upper()
      ):
        matched_rule = rule
        break

  if not matched_rule:
    raise ValueError(
        f"該当する高額療養費のルールが見つかりません (日付: {target_date}, 区分:"
        f" {income_category})"
    )

  formula_dict = matched_rule["formula"]
  key = "frequent" if is_frequent else "normal"
  formula_str = formula_dict.get(key, "0")

  # 数式内の変数に実際の医療費をバインドして計算
  local_vars = {"eligible_medical_cost": eligible_medical_cost}
  eval_dict = {**py_safe_dict, **local_vars}

  try:
    exact_limit = eval(formula_str, {"__builtins__": {}}, eval_dict)
  except Exception as e:
    raise RuntimeError(f"数式評価エラー: {formula_str}") from e

  return int(exact_limit)
def calculate(*args, **kwargs):
  """互換性のためのラッパー関数"""
  return calculate_exact_limit(*args, **kwargs)


def requires_rounding_review(*args, **kwargs):
  """必要に応じて追加するスタブ関数"""
  return False