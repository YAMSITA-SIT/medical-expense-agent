from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class IncomeCategory(StrEnum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    E = "E"


class ExpenseUnit(BaseModel):
    """One monthly calculation unit after separating provider/type/inpatient/outpatient."""

    model_config = ConfigDict(extra="forbid")

    person_id: str | None = None
    age: int | None = Field(default=None, ge=0, le=130)
    insurer_id: str | None = None
    calculation_unit_id: str | None = None
    insurance_covered: bool | None = None
    total_medical_cost_yen: int | None = Field(default=None, ge=0)
    patient_paid_yen: int | None = Field(default=None, ge=0)


class EvaluationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_month: str | None = None
    primary_person_id: str | None = None
    primary_age: int | None = Field(default=None, ge=0, le=130)
    insurer_id: str | None = None
    income_category: IncomeCategory | None = None
    high_cost_benefit_count_previous_12_months: int | None = Field(default=None, ge=0, le=12)
    expenses: list[ExpenseUnit] | None = None


class MissingInformation(BaseModel):
    field: str
    reason: str


class IncludedUnit(BaseModel):
    calculation_unit_id: str
    person_id: str
    patient_paid_yen: int
    total_medical_cost_yen: int


class EvaluationResponse(BaseModel):
    status: Literal["calculated", "additional_information_required", "unsupported"]
    eligibility_possibility: bool | None
    self_payment_limit_yen: int | None
    estimated_refund_yen: int | None
    applied_policy_period: str | None
    multiple_occurrence_applied: bool | None
    used_inputs: dict[str, Any]
    included_units: list[IncludedUnit]
    excluded_units: list[dict[str, Any]]
    calculation_formula: str | None
    calculation_steps: list[str]
    reasons: list[str]
    missing_information: list[MissingInformation]
    cautions: list[str]
