"""Opt-in Azure integration test using only a generated fictional receipt."""

import asyncio
import os
from pathlib import Path

import pytest

from app.workflow.ocr import AzureDocumentIntelligenceOCR
from scripts.generate_fictional_receipt import generate


def test_azure_live_with_fictional_receipt(tmp_path: Path):
    if os.getenv("RUN_AZURE_LIVE_TEST") != "1":
        pytest.skip("set RUN_AZURE_LIVE_TEST=1 to opt in to an Azure request")
    endpoint = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
    key = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY")
    if not endpoint or not key:
        pytest.skip("Azure endpoint/key are not both configured")

    try:
        image_path = generate(tmp_path / "fictional-receipt.png")
    except RuntimeError as error:
        pytest.skip(str(error))

    document = asyncio.run(
        AzureDocumentIntelligenceOCR(endpoint, key).extract(image_path.read_bytes(), "image/png")
    )
    assert document.source == "ocr"
    assert document.content_hash
    assert document.document_type.value in {"receipt", None}
    assert document.name.value in {"架空", "架空太郎", "架空 太郎", None}
