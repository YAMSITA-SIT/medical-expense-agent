from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_api_calculates_single_person() -> None:
    response = client.post(
        "/v1/high-cost-medical-expense/evaluate",
        json={
            "target_month": "2026-09",
            "primary_person_id": "p1",
            "primary_age": 45,
            "insurer_id": "i1",
            "income_category": "C",
            "high_cost_benefit_count_previous_12_months": 0,
            "expenses": [
                {
                    "person_id": "p1",
                    "age": 45,
                    "insurer_id": "i1",
                    "calculation_unit_id": "h1-medical-inpatient",
                    "insurance_covered": True,
                    "total_medical_cost_yen": 1_000_000,
                    "patient_paid_yen": 300_000,
                }
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["self_payment_limit_yen"] == 92_940
    assert body["estimated_refund_yen"] == 207_060
