from datetime import date
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt

from app.models import IncomeCategory
from app.workflow.codes import ExceptionCode, Status

Yen = Annotated[StrictInt, Field(ge=0)]
Text = Annotated[str, Field(min_length=1, max_length=200)]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Extracted[T](Model):
    value: T | None = None
    confidence: float = Field(default=0, ge=0, le=1, allow_inf_nan=False)
    confirmed: StrictBool = False
    bounding_regions: list[list[float]] = Field(default_factory=list)


class Document(Model):
    document_id: Text
    source: Literal["mock", "ocr", "manual"] = "manual"
    person_id: Text | None = None
    name: Extracted[Text] = Field(default_factory=Extracted)
    birth_date: Extracted[date] = Field(default_factory=Extracted)
    service_month: Extracted[Text] = Field(default_factory=Extracted)
    service_date: Extracted[date] = Field(default_factory=Extracted)
    provider_name: Extracted[Text] = Field(default_factory=Extracted)
    total_medical_cost_yen: Extracted[Yen] = Field(default_factory=Extracted)
    patient_paid_yen: Extracted[Yen] = Field(default_factory=Extracted)
    care_setting: Extracted[Literal["inpatient", "outpatient"]] = Field(default_factory=Extracted)
    discipline: Extracted[Literal["medical", "dental"]] = Field(default_factory=Extracted)
    uninsured_cost_yen: Extracted[Yen] = Field(default_factory=Extracted)
    private_room_cost_yen: Extracted[Yen] = Field(default_factory=Extracted)
    meal_cost_yen: Extracted[Yen] = Field(default_factory=Extracted)
    receipt_number: Extracted[Text] = Field(default_factory=Extracted)
    document_type: Extracted[Literal["receipt", "itemized_statement"]] = Field(
        default_factory=Extracted
    )
    insurance_number: Extracted[Text] = Field(default_factory=Extracted)
    account_number: Extracted[Text] = Field(default_factory=Extracted)
    content_hash: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


class Person(Model):
    person_id: Text
    birth_date: date | None = None
    insurer_id: Text | None = None
    benefit_household_id: Text | None = None
    # Must be verified as one NHI benefit household or insured + dependants.


class CoveragePeriod(Model):
    person_id: Text
    insurer_id: Text
    valid_from: date
    valid_to: date | None = None  # Inclusive, normalized by the external adapter.
    insurance_type: Literal["nhi", "employee", "elderly"]
    retroactive: StrictBool = False


class Expense(Model):
    expense_id: Text
    person_id: Text | None = None
    document_id: Text | None = None
    service_month: Text | None = None
    provider_id: Text | None = None
    care_setting: Literal["inpatient", "outpatient"] | None = None
    discipline: Literal["medical", "dental"] | None = None
    insurance_covered: StrictBool | None = None
    cost_type: (
        Literal["insured", "private_room", "meal", "living", "advanced_medical", "uninsured"] | None
    ) = None
    total_medical_cost_yen: Yen | None = None
    patient_paid_yen: Yen | None = None
    receipt_total_medical_cost_yen: Yen | None = None
    receipt_patient_paid_yen: Yen | None = None
    costs_separated: StrictBool | None = None


class CaseRequest(Model):
    schema_version: Literal["2.0"] = "2.0"
    case_id: Text
    target_month: Text | None = None
    primary_person_id: Text | None = None
    income_category: IncomeCategory | None = None
    high_cost_benefit_count_previous_12_months: Annotated[StrictInt, Field(ge=0, le=12)] | None = (
        None
    )
    people: list[Person] = Field(default_factory=list, max_length=50)
    expenses: list[Expense] = Field(default_factory=list, max_length=500)
    documents: list[Document] = Field(default_factory=list, max_length=500)
    receipt_state: Literal["received", "pending"] | None = None
    # Explicit confirmation is required; omitted means unknown, never false.
    exception_screening_completed: StrictBool | None = None
    household_verified: StrictBool | None = None
    benefit_history_verified: StrictBool | None = None
    events: list[ExceptionCode] = Field(default_factory=list)
    prior_application_ids: list[Text] = Field(default_factory=list)
    correction_of_case_id: Text | None = None
    coverage_periods: list[CoveragePeriod] = Field(default_factory=list, max_length=100)


class Missing(Model):
    field: str
    reason: str
    question: str


class ExceptionFinding(Model):
    code: ExceptionCode
    category: str
    reason: str
    required_action: str


class CaseResponse(Model):
    schema_version: Literal["2.0"] = "2.0"
    case_id: str
    status: Status
    missing_information: list[Missing] = Field(default_factory=list)
    exception_codes: list[ExceptionFinding] = Field(default_factory=list)
    calculation_result: dict[str, Any] | None = None
    next_action: str
    notice: str = "最終的な支給可否・金額は保険者が決定します。"
