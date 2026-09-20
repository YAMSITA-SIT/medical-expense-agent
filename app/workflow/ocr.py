import asyncio
import hashlib
import os
import re
import time
from dataclasses import dataclass
from datetime import date
from io import BytesIO
from typing import Any, Protocol
from urllib.parse import urlparse

import httpx
from PIL import Image, UnidentifiedImageError

from app.workflow.codes import OCR_MIN_CONFIDENCE
from app.workflow.models import Document

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
AZURE_API_VERSION = "2024-11-30"
AZURE_MODEL_ID = "prebuilt-read"
OCR_TIMEOUT_SECONDS = 30.0


class OCRProviderError(Exception):
    """A deliberately detail-free provider error safe for application handling."""


class OCRProviderTimeout(OCRProviderError):
    pass


class OCRProvider(Protocol):
    async def extract(self, image: bytes, media_type: str) -> Document: ...


@dataclass(frozen=True)
class OCRLine:
    text: str
    confidence: float
    polygon: list[float]


def image_hash(data: bytes) -> str:
    """One-way identifier; image bytes are never persisted."""
    return hashlib.sha256(data).hexdigest()


class DuplicateDetector:
    """Best-effort, process-local duplicate detection with expiring hashes only."""

    def __init__(self, ttl_seconds: int = 600) -> None:
        self.ttl_seconds = ttl_seconds
        self._seen: dict[str, float] = {}

    def check_and_record(self, digest: str) -> bool:
        now = time.monotonic()
        self._seen = {key: expiry for key, expiry in self._seen.items() if expiry > now}
        duplicate = digest in self._seen
        self._seen[digest] = now + self.ttl_seconds
        return duplicate


duplicate_detector = DuplicateDetector()


def validate_image(data: bytes, media_type: str) -> None:
    try:
        with Image.open(BytesIO(data)) as image:
            expected = {"image/png": "PNG", "image/jpeg": "JPEG"}.get(media_type)
            if (
                image.format != expected
                or image.width * image.height > MAX_IMAGE_PIXELS
                or not (50 <= image.width <= 10_000 and 50 <= image.height <= 10_000)
            ):
                raise ValueError("unsupported image")
            image.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise ValueError("invalid image") from error


class MockOCR:
    """Fixed, fictional output. Never claim to have read the uploaded image."""

    async def extract(self, image: bytes, media_type: str) -> Document:
        return Document.model_validate(
            {
                "document_id": "fictional-document-1",
                "source": "mock",
                "person_id": "fictional-person-1",
                "content_hash": image_hash(image),
                **{
                    key: {"value": value, "confidence": 0.98, "confirmed": False}
                    for key, value in {
                        "name": "架空の患者A",
                        "birth_date": "1980-01-15",
                        "service_month": "2026-07",
                        "service_date": "2026-07-15",
                        "provider_name": "架空病院A",
                        "total_medical_cost_yen": 1000000,
                        "patient_paid_yen": 300000,
                        "care_setting": "inpatient",
                        "discipline": "medical",
                        "uninsured_cost_yen": 0,
                        "private_room_cost_yen": 0,
                        "meal_cost_yen": 0,
                        "receipt_number": "FICTIONAL-001",
                        "document_type": "receipt",
                    }.items()
                },
            }
        )


class AzureDocumentIntelligenceOCR:
    def __init__(
        self,
        endpoint: str,
        key: str,
        *,
        client: httpx.AsyncClient | None = None,
        timeout_seconds: float = OCR_TIMEOUT_SECONDS,
        poll_interval_seconds: float = 0.25,
    ) -> None:
        parsed = urlparse(endpoint)
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("Azure endpoint must be an HTTPS URL")
        self.endpoint = endpoint.rstrip("/")
        self.key = key
        self.client = client
        self.timeout_seconds = timeout_seconds
        self.poll_interval_seconds = poll_interval_seconds

    async def extract(self, image: bytes, media_type: str) -> Document:
        owned_client = self.client is None
        client = self.client or httpx.AsyncClient(timeout=self.timeout_seconds)
        try:
            url = (
                f"{self.endpoint}/documentintelligence/documentModels/"
                f"{AZURE_MODEL_ID}:analyze?api-version={AZURE_API_VERSION}&locale=ja"
            )
            response = await client.post(
                url,
                content=image,
                headers={"Content-Type": media_type, "Ocp-Apim-Subscription-Key": self.key},
            )
            if response.status_code != 202:
                raise OCRProviderError()
            operation_url = response.headers.get("Operation-Location")
            valid_operation_host = (
                operation_url and urlparse(operation_url).netloc == urlparse(self.endpoint).netloc
            )
            if not valid_operation_host:
                raise OCRProviderError()
            deadline = time.monotonic() + self.timeout_seconds
            while time.monotonic() < deadline:
                poll = await client.get(
                    operation_url, headers={"Ocp-Apim-Subscription-Key": self.key}
                )
                if poll.status_code != 200:
                    raise OCRProviderError()
                payload = poll.json()
                status = payload.get("status")
                if status == "succeeded":
                    return document_from_azure(payload.get("analyzeResult", {}), image)
                if status in {"failed", "canceled"}:
                    raise OCRProviderError()
                await asyncio.sleep(self.poll_interval_seconds)
            raise OCRProviderTimeout()
        except (TimeoutError, httpx.TimeoutException) as error:
            raise OCRProviderTimeout() from error
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
            raise OCRProviderError() from error
        finally:
            if owned_client:
                await client.aclose()


def _lines(result: dict[str, Any]) -> list[OCRLine]:
    output = []
    for page in result.get("pages", []):
        words = page.get("words", [])
        for line in page.get("lines", []):
            confidences = []
            for word in words:
                offset = word.get("span", {}).get("offset", -1)
                if any(
                    offset >= span.get("offset", 0)
                    and offset < span.get("offset", 0) + span.get("length", 0)
                    for span in line.get("spans", [])
                ):
                    confidences.append(float(word.get("confidence", 0)))
            output.append(
                OCRLine(
                    line.get("content", ""),
                    min(confidences) if confidences else 0.0,
                    line.get("polygon", []),
                )
            )
    return output


def _field(lines: list[OCRLine], labels: str, value_pattern: str) -> dict[str, Any]:
    for index, line in enumerate(lines):
        if not re.search(labels, line.text):
            continue
        for candidate in [line, *lines[index + 1 : index + 2]]:
            match = re.search(value_pattern, candidate.text)
            if match:
                return {
                    "value": match.group(1).strip(),
                    "confidence": min(line.confidence, candidate.confidence),
                    "confirmed": False,
                    "bounding_regions": [candidate.polygon] if candidate.polygon else [],
                }
    return {"value": None, "confidence": 0, "confirmed": False, "bounding_regions": []}


def _yen(lines: list[OCRLine], labels: str) -> dict[str, Any]:
    item = _field(lines, labels, r"(?:￥|¥)?\s*([0-9０-９][0-9０-９,，]*)\s*円?")
    if item["value"] is not None:
        normalized = str(item["value"]).translate(
            str.maketrans("０１２３４５６７８９，", "0123456789,")
        )
        item["value"] = int(normalized.replace(",", ""))
    return item


def _date_value(item: dict[str, Any]) -> dict[str, Any]:
    if item["value"] is None:
        return item
    value = str(item["value"]).translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    match = re.search(r"((?:19|20)\d{2})\D+(\d{1,2})\D+(\d{1,2})", value)
    if not match:
        return {**item, "value": None, "confidence": 0}
    try:
        item["value"] = date(*(int(part) for part in match.groups())).isoformat()
    except ValueError:
        item["value"], item["confidence"] = None, 0
    return item


def document_from_azure(result: dict[str, Any], image: bytes) -> Document:
    lines = _lines(result)
    service_date = _date_value(
        _field(
            lines,
            r"診療(?:年月)?日|受診日",
            r"((?:20)?\d{2}[年/.\-]\d{1,2}[月/.\-]\d{1,2}日?)",
        )
    )
    service_month = {**service_date}
    service_month["value"] = service_date["value"][:7] if service_date["value"] else None
    care = _field(lines, r"入院|外来", r"(入院|外来)")
    care["value"] = {"入院": "inpatient", "外来": "outpatient"}.get(care["value"])
    discipline = _field(lines, r"医科|歯科", r"(医科|歯科)")
    discipline["value"] = {"医科": "medical", "歯科": "dental"}.get(discipline["value"])
    doc_type = _field(lines, r"診療明細書|領収書", r"(診療明細書|領収書)")
    doc_type["value"] = {
        "診療明細書": "itemized_statement",
        "領収書": "receipt",
    }.get(doc_type["value"])
    digest = image_hash(image)
    return Document.model_validate(
        {
            "document_id": f"ocr-{digest[:20]}",
            "source": "ocr",
            "content_hash": digest,
            "name": _field(lines, r"患者氏名|氏名", r"(?:患者氏名|氏名)?\s*[:：]?\s*([^\s]{2,40})"),
            "birth_date": _date_value(
                _field(
                    lines,
                    r"生年月日",
                    r"((?:19|20)\d{2}[年/.\-]\d{1,2}[月/.\-]\d{1,2}日?)",
                )
            ),
            "service_date": service_date,
            "service_month": service_month,
            "provider_name": _field(
                lines,
                r"病院|医院|診療所|クリニック|歯科",
                r"([^\s]{2,80}(?:病院|医院|診療所|クリニック|歯科))",
            ),
            "total_medical_cost_yen": _yen(lines, r"総医療費|診療費総額|保険診療費"),
            "patient_paid_yen": _yen(lines, r"自己負担(?:額)?|患者負担(?:額)?|領収金額|請求額"),
            "care_setting": care,
            "discipline": discipline,
            "uninsured_cost_yen": _yen(lines, r"保険外|自費"),
            "private_room_cost_yen": _yen(lines, r"差額ベッド|室料差額"),
            "meal_cost_yen": _yen(lines, r"食事療養|食事負担"),
            "receipt_number": _field(
                lines,
                r"領収書番号|領収番号",
                r"(?:領収書?番号)?\s*[:：]?\s*([A-Za-z0-9\-]{3,40})",
            ),
            "document_type": doc_type,
        }
    )


def required_review_fields(document: Document) -> list[dict[str, str]]:
    labels = {
        "name": ("氏名", "領収書に記載されている氏名を確認してください"),
        "service_date": ("診療年月日", "領収書に記載されている診療年月日を確認してください"),
        "provider_name": ("医療機関名", "領収書に記載されている医療機関名を確認してください"),
        "total_medical_cost_yen": (
            "保険診療の総医療費",
            "保険診療の総医療費を確認してください",
        ),
        "patient_paid_yen": ("自己負担額", "保険診療分の自己負担額を確認してください"),
        "care_setting": ("入院・外来", "入院または外来の区分を確認してください"),
        "discipline": ("医科・歯科", "医科または歯科の区分を確認してください"),
        "document_type": (
            "書類種別",
            "診療明細書または領収書の区別を確認してください",
        ),
    }
    missing = []
    for field, (label, question) in labels.items():
        item = getattr(document, field)
        if item.value is None:
            reason = f"OCRで{label}を特定できませんでした"
        elif item.confidence < OCR_MIN_CONFIDENCE:
            reason = f"{label}のOCR信頼度が基準未満です"
        else:
            continue
        missing.append({"field": field, "reason": reason, "question": question})
    return missing


def get_ocr_provider() -> OCRProvider:
    endpoint = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
    key = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY")
    if endpoint and key:
        return AzureDocumentIntelligenceOCR(endpoint, key)
    return MockOCR()
