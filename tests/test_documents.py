import asyncio
import json
from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.workflow.ocr import MAX_IMAGE_BYTES, MockOCR, get_ocr_provider

client = TestClient(app)


def image_bytes():
    buffer = BytesIO()
    Image.new("RGB", (50, 50), "white").save(buffer, format="PNG")
    return buffer.getvalue()


def test_upload_mock_and_masking():
    response = client.post(
        "/v2/documents/extract", content=image_bytes(), headers={"Content-Type": "image/png"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["document"]["source"] == "mock"
    assert body["document"]["name"]["value"] == "***"
    assert body["document"]["total_medical_cost_yen"]["confidence"] == 0.98
    response = client.post(
        "/v2/documents/extract?mask=false",
        content=image_bytes(),
        headers={"Content-Type": "image/png"},
    )
    assert response.json()["document"]["name"]["value"] == "架空の患者A"


def test_bad_and_large_uploads():
    assert client.post("/v2/documents/extract", content=b"bad").status_code == 415
    assert (
        client.post(
            "/v2/documents/extract", content=b"bad", headers={"Content-Type": "image/png"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/v2/documents/extract",
            content=b"a" * (MAX_IMAGE_BYTES + 1),
            headers={"Content-Type": "image/png"},
        ).status_code
        == 413
    )


def test_low_confidence_and_confirmation_flow():
    case = json.loads(Path("examples/workflow_case.json").read_text())
    document = asyncio.run(MockOCR().extract(b"", "image/png")).model_dump(mode="json")
    document["patient_paid_yen"]["confidence"] = 0.3
    case["documents"] = [document]
    case["expenses"][0]["document_id"] = document["document_id"]
    result = client.post("/v2/cases/evaluate", json=case).json()
    assert result["status"] == "manual_review_required"
    assert "OCR_LOW_CONFIDENCE" in [e["code"] for e in result["exception_codes"]]
    assert result["calculation_result"] is None
    for value in document.values():
        if isinstance(value, dict) and value.get("value") is not None:
            value["confirmed"] = True
    result = client.post("/v2/cases/evaluate", json=case).json()
    assert result["status"] == "calculation_completed"
    # Changing the derived calculation input cannot silently override confirmed OCR.
    case["expenses"][0]["patient_paid_yen"] = 290000
    result = client.post("/v2/cases/evaluate", json=case).json()
    assert result["status"] == "manual_review_required"


def test_ocr_failure_hides_provider_error(caplog):
    class FailingOCR:
        async def extract(self, image, media_type):
            raise ValueError("SECRET-PATIENT")

    app.dependency_overrides[get_ocr_provider] = lambda: FailingOCR()
    try:
        response = client.post(
            "/v2/documents/extract", content=image_bytes(), headers={"Content-Type": "image/png"}
        )
        assert response.status_code == 502
        assert "SECRET-PATIENT" not in response.text + caplog.text
    finally:
        app.dependency_overrides.clear()
