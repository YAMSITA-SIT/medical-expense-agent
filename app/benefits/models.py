from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models import IncomeCategory


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class PatientInput(StrictModel):
    person_id: str | None = None
    birth_date: date | None = None
    age: int | None = Field(default=None, ge=0, le=130)


class InsuranceInput(StrictModel):
    type: Literal["nhi", "employee", "mutual", "elderly"] | None = None
    insurer_number: str | None = None


class IncomeInput(StrictModel):
    category: IncomeCategory | None = None
    standard_monthly_remuneration_yen: int | None = Field(default=None, ge=0)
    resident_tax_exempt: bool | None = None


class CostInput(StrictModel):
    total_medical_cost_yen: int | None = Field(default=None, ge=0)
    insurance_covered_cost_yen: int | None = Field(default=None, ge=0)
    patient_paid_yen: int | None = Field(default=None, ge=0)
    uninsured_cost_yen: int | None = Field(default=None, ge=0)


class CareInput(StrictModel):
    setting: Literal["inpatient", "outpatient"] | None = None
    discipline: Literal["medical", "dental"] | None = None
    provider_id: str | None = None


class HouseholdExpense(StrictModel):
    person_id: str
    age: int = Field(ge=0, le=130)
    insurer_number: str
    provider_id: str
    setting: Literal["inpatient", "outpatient"]
    discipline: Literal["medical", "dental"]
    total_medical_cost_yen: int = Field(ge=0)
    patient_paid_yen: int = Field(ge=0)
    insurance_covered: bool


class SpecialCases(StrictModel):
    screening_completed: bool | None = None
    public_funding: bool = False
    psychiatric_outpatient: bool = False
    workers_compensation: bool = False
    third_party_injury: bool = False
    supplementary_benefit: bool = False
    specified_disease: bool = False
    overseas_care: bool = False
    orthotic_device: bool = False
    annual_cap: bool = False
    insurance_changed_during_month: bool = False
    turned_75_during_month: bool = False


class BenefitEvaluationRequest(StrictModel):
    schema_version: Literal["1.0"] = "1.0"
    patient: PatientInput = Field(default_factory=PatientInput)
    service_date: date | None = None
    service_month: str | None = None
    insurance: InsuranceInput = Field(default_factory=InsuranceInput)
    income: IncomeInput = Field(default_factory=IncomeInput)
    costs: CostInput = Field(default_factory=CostInput)
    care: CareInput = Field(default_factory=CareInput)
    household_expenses: list[HouseholdExpense] = Field(default_factory=list)
    prior_12_month_benefit_months: list[str] | None = None
    special_cases: SpecialCases = Field(default_factory=SpecialCases)
    ocr_confidence: dict[str, float] = Field(default_factory=dict)


class AppliedRule(StrictModel):
    rule_id: str
    effective_from: date
    effective_to: date
    formula: str
    source_document: str
    source_article: str
    source_url: str
    confirmation_status: str


class BenefitEvaluationResponse(StrictModel):
    status: Literal[
        "calculated", "additional_information_required", "human_review_required", "unsupported"
    ]
    applicable_programs: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    calculation: dict[str, Any] | None = None
    applied_rules: list[AppliedRule] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    needs_human_review: bool

