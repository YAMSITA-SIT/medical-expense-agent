import asyncio
from io import BytesIO

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.workflow.ocr import (
    AzureDocumentIntelligenceOCR,
    MockOCR,
    OCRProviderError,
    OCRProviderTimeout,
    get_ocr_provider,
    required_review_fields,
)

client = TestClient(app)


def image_bytes(fmt: str = "PNG") -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (100, 100), "white").save(buffer, format=fmt)
    return buffer.getvalue()


def azure_result(confidence: float = 0.99) -> dict:
    texts = [
        "領収書",
        "患者氏名：架空太郎",
        "生年月日 2000年1月2日",
        "診療年月日 2026年9月20日",
        "架空病院",
        "総医療費 100,000円",
        "自己負担額 30,000円",
        "入院",
        "医科",
        "保険外 0円",
        "差額ベッド代 0円",
        "食事療養費 0円",
        "領収書番号 ABC-123",
    ]
    lines = []
    words = []
    offset = 0
    for row, text in enumerate(texts):
        span = {"offset": offset, "length": len(text)}
        polygon = [0, row, 10, row, 10, row + 1, 0, row + 1]
        lines.append({"content": text, "spans": [span], "polygon": polygon})
        words.append({"content": text, "confidence": confidence, "span": span})
        offset += len(text) + 1
    return {"status": "succeeded", "analyzeResult": {"pages": [{"lines": lines, "words": words}]}}


def test_azure_adapter_normal_response():
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert "Ocp-Apim-Subscription-Key" in request.headers
        if request.method == "POST":
            return httpx.Response(
                202,
                headers={
                    "Operation-Location": "https://example.cognitiveservices.azure.com/result/1"
                },
            )
        return httpx.Response(200, json=azure_result())

    transport = httpx.MockTransport(handler)
    async_client = httpx.AsyncClient(transport=transport)
    provider = AzureDocumentIntelligenceOCR(
        "https://example.cognitiveservices.azure.com",
        "secret",
        client=async_client,
        poll_interval_seconds=0,
    )
    document = asyncio.run(provider.extract(image_bytes(), "image/png"))
    asyncio.run(async_client.aclose())
    assert calls == 2
    assert document.source == "ocr"
    assert document.provider_name.value == "架空病院"
    assert document.patient_paid_yen.value == 30000
    assert document.document_type.value == "receipt"
    assert document.patient_paid_yen.bounding_regions


def test_environment_fallback(monkeypatch):
    monkeypatch.delenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", raising=False)
    monkeypatch.delenv("AZURE_DOCUMENT_INTELLIGENCE_KEY", raising=False)
    assert isinstance(get_ocr_provider(), MockOCR)
    monkeypatch.setenv(
        "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
        "https://example.cognitiveservices.azure.com",
    )
    monkeypatch.setenv("AZURE_DOCUMENT_INTELLIGENCE_KEY", "secret")
    assert isinstance(get_ocr_provider(), AzureDocumentIntelligenceOCR)


def test_provider_error_and_timeout_are_typed():
    error_client = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(400, text="患者=秘密"))
    )
    error_provider = AzureDocumentIntelligenceOCR(
        "https://example.cognitiveservices.azure.com", "key", client=error_client
    )
    with pytest.raises(OCRProviderError) as error:
        asyncio.run(error_provider.extract(image_bytes(), "image/png"))
    assert "秘密" not in str(error.value)
    asyncio.run(error_client.aclose())

    def timeout_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("患者=秘密", request=request)

    timeout_client = httpx.AsyncClient(transport=httpx.MockTransport(timeout_handler))
    timeout_provider = AzureDocumentIntelligenceOCR(
        "https://example.cognitiveservices.azure.com", "key", client=timeout_client
    )
    with pytest.raises(OCRProviderTimeout) as timeout:
        asyncio.run(timeout_provider.extract(image_bytes(), "image/png"))
    assert "秘密" not in str(timeout.value)
    asyncio.run(timeout_client.aclose())


def test_low_confidence_requires_manual_review():
    async def extract():
        async_client = httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: (
                    httpx.Response(
                        202,
                        headers={
                            "Operation-Location": "https://example.cognitiveservices.azure.com/result/1"
                        },
                    )
                    if request.method == "POST"
                    else httpx.Response(200, json=azure_result(0.4))
                )
            )
        )
        provider = AzureDocumentIntelligenceOCR(
            "https://example.cognitiveservices.azure.com",
            "key",
            client=async_client,
            poll_interval_seconds=0,
        )
        document = await provider.extract(image_bytes(), "image/png")
        await async_client.aclose()
        return document

    missing = required_review_fields(asyncio.run(extract()))
    assert missing
    assert all(item["question"] for item in missing)


def test_real_ocr_endpoint_masks_and_never_returns_raw(monkeypatch):
    class FakeAzure:
        async def extract(self, image, media_type):
            async_client = httpx.AsyncClient(
                transport=httpx.MockTransport(
                    lambda request: (
                        httpx.Response(
                            202,
                            headers={
                                "Operation-Location": (
                                    "https://example.cognitiveservices.azure.com/result/1"
                                )
                            },
                        )
                        if request.method == "POST"
                        else httpx.Response(200, json=azure_result())
                    )
                )
            )
            provider = AzureDocumentIntelligenceOCR(
                "https://example.cognitiveservices.azure.com",
                "key",
                client=async_client,
                poll_interval_seconds=0,
            )
            document = await provider.extract(image, media_type)
            await async_client.aclose()
            return document

    app.dependency_overrides[get_ocr_provider] = FakeAzure
    try:
        response = client.post(
            "/v2/documents/extract",
            content=image_bytes(),
            headers={"Content-Type": "image/png"},
        )
        body = response.json()
        assert response.status_code == 200
        assert body["status"] == "manual_review_required"
        assert body["calculation_result"] is None
        assert body["document"]["name"]["value"] == "***"
        assert "架空太郎" not in response.text
        assert "pages" not in response.text
    finally:
        app.dependency_overrides.clear()


def test_user_correction_conflict_routes_to_staff():
    # Existing workflow comparison is the security boundary: confirmed OCR and
    # a different calculation value must not be silently accepted.
    import json
    from pathlib import Path

    case = json.loads(Path("examples/workflow_case.json").read_text())
    document = asyncio.run(MockOCR().extract(image_bytes(), "image/png")).model_dump(mode="json")
    for item in document.values():
        if isinstance(item, dict) and item.get("value") is not None:
            item["confirmed"] = True
    case["documents"] = [document]
    case["expenses"][0]["document_id"] = document["document_id"]
    case["expenses"][0]["patient_paid_yen"] = 299999
    assert client.post("/v2/cases/evaluate", json=case).json()["status"] == "manual_review_required"
