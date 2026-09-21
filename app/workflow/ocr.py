import asyncio
import base64
import hashlib
import json
import logging
import os
import re
import time
from dataclasses import dataclass
from datetime import date
from io import BytesIO
from typing import Any, Protocol
from urllib.parse import urlparse

import httpx
from PIL import Image, ImageFilter, ImageStat, UnidentifiedImageError

from app.workflow.codes import OCR_MIN_CONFIDENCE
from app.workflow.models import Document

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
AZURE_API_VERSION = "2024-11-30"
AZURE_MODEL_ID = "prebuilt-read"
OCR_TIMEOUT_SECONDS = 30.0

logger = logging.getLogger(__name__)


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


def image_quality_issues(data: bytes) -> list[str]:
    """Conservative preflight hints; OCR confidence remains the final readability signal."""
    issues: list[str] = []
    with Image.open(BytesIO(data)) as image:
        grayscale = image.convert("L")
        if ImageStat.Stat(grayscale).stddev[0] < 12:
            issues.append("画像のコントラストが低いため、原本との目視確認が必要です")
        edges = grayscale.filter(ImageFilter.FIND_EDGES)
        if ImageStat.Stat(edges).mean[0] < 2:
            issues.append("画像が不鮮明な可能性があります")
        if image.getexif().get(274) not in {None, 1}:
            issues.append("画像の向き補正情報があるため、傾き・回転を確認してください")
    return issues


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
                        "issue_date": "2026-07-15",
                        "insurance_covered_amount_yen": 700000,
                        "department": "内科",
                        "insurer_number": "00000000",
                        "insurance_symbol": "架空",
                        "insurance_member_number": "0001",
                    }.items()
                },
                "raw_text": (
                    "領収書\n患者氏名 架空の患者A\n架空病院A\n"
                    "診療日 2026年7月15日\n総医療費 1,000,000円\n"
                    "保険適用額 700,000円\n自己負担額 300,000円"
                ),
            }
        )


class OrcaRouterOCR:
    """OrcaRouterを利用し、セキュリティ・コスト・品質を最適化するOCRプロバイダー"""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "openai/gpt-4o-mini",
        client: httpx.AsyncClient | None = None,
        timeout_seconds: float = OCR_TIMEOUT_SECONDS,
    ) -> None:
        self.api_key = api_key or os.getenv("ORCAROUTER_API_KEY")
        # OrcaRouter の OpenAI 互換 API。旧コードの .com ではなく .ai を使用する。
        base_url = os.getenv("ORCAROUTER_BASE_URL", "https://api.orcarouter.ai/v1")
        self.endpoint = f"{base_url.rstrip('/')}/chat/completions"
        self.model = os.getenv("ORCAROUTER_MODEL", model)
        self.client = client
        self.timeout_seconds = timeout_seconds

    async def extract(self, image: bytes, media_type: str) -> Document:
        if not self.api_key:
            raise OCRProviderError("ORCAROUTER_API_KEY is not configured")

        base64_image = base64.b64encode(image).decode("utf-8")
        data_url = f"data:{media_type};base64,{base64_image}"

        prompt = """
        添付された医療機関の領収書・明細書画像から、以下の項目を抽出して指定のJSON形式で返してください。
        読み取れない項目は null にしてください。
        
        抽出項目:
        1. 氏名 (name)
        2. 生年月日 (birth_date: YYYY-MM-DD)
        3. 診療年月日 (service_date: YYYY-MM-DD)
        4. 医療機関名 (provider_name)
        5. 総医療費 (total_medical_cost_yen: 数値)
        6. 自己負担額 (patient_paid_yen: 数値)
        7. 入院/外来 (care_setting: "inpatient" または "outpatient")
        8. 医科/歯科 (discipline: "medical" または "dental")
        9. 保険外費用 (uninsured_cost_yen: 数値)
        10. 差額ベッド代 (private_room_cost_yen: 数値)
        11. 食事療養費 (meal_cost_yen: 数値)
        12. 領収書番号 (receipt_number)
        13. 書類種別 (document_type: "receipt" または "itemized_statement")

        出力フォーマット(JSONのみ):
        {
          "name": "...",
          "birth_date": "YYYY-MM-DD",
          "service_date": "YYYY-MM-DD",
          "provider_name": "...",
          "total_medical_cost_yen": 10000,
          "patient_paid_yen": 3000,
          "care_setting": "outpatient",
          "discipline": "medical",
          "uninsured_cost_yen": 0,
          "private_room_cost_yen": 0,
          "meal_cost_yen": 0,
          "receipt_number": "...",
          "document_type": "receipt"
        }
        """

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
        }

        owned_client = self.client is None
        client = self.client or httpx.AsyncClient(timeout=self.timeout_seconds)

        try:
            response = await client.post(self.endpoint, headers=headers, json=payload)
            if response.is_error:
                # APIキーや画像そのものは出力せず、原因調査に必要な応答だけを記録する。
                logger.error(
                    "OrcaRouter request failed: status=%s body=%s",
                    response.status_code,
                    response.text[:2000],
                )
                raise OCRProviderError(
                    f"OrcaRouter returned HTTP {response.status_code}"
                )

            res_data = response.json()
            content = res_data["choices"][0]["message"]["content"]

            # モデルによっては JSON を Markdown のコードブロックで返すことがある。
            if isinstance(content, list):
                content = "".join(
                    part.get("text", "")
                    for part in content
                    if isinstance(part, dict) and part.get("type") == "text"
                )
            if not isinstance(content, str):
                raise TypeError("OrcaRouter response content is not text")
            content = content.strip()
            if content.startswith("```"):
                content = re.sub(r"^```(?:json)?\s*", "", content, flags=re.IGNORECASE)
                content = re.sub(r"\s*```$", "", content)
            parsed = json.loads(content)

            digest = image_hash(image)
            service_date_val = parsed.get("service_date")
            service_month_val = service_date_val[:7] if service_date_val else None

            doc_dict = {
                "document_id": f"orcarouter-{digest[:20]}",
                "source": "ocr",
                "content_hash": digest,
            }

            fields = [
                "name",
                "birth_date",
                "service_date",
                "provider_name",
                "total_medical_cost_yen",
                "patient_paid_yen",
                "care_setting",
                "discipline",
                "uninsured_cost_yen",
                "private_room_cost_yen",
                "meal_cost_yen",
                "receipt_number",
                "document_type",
            ]

            for field in fields:
                val = parsed.get(field)
                if val in ["null", "None", ""]:
                    val = None

                doc_dict[field] = {
                    "value": val,
                    "confidence": 0.95 if val is not None else 0.0,
                    "confirmed": False,
                }

            doc_dict["service_month"] = {
                "value": service_month_val,
                "confidence": 0.95 if service_month_val else 0.0,
                "confirmed": False,
            }

            doc_dict["raw_text"] = parsed.get("raw_text")
            return Document.model_validate(doc_dict)

        except (TimeoutError, httpx.TimeoutException) as error:
            logger.error("OrcaRouter request timed out")
            raise OCRProviderTimeout() from error
        except OCRProviderError:
            raise
        except (httpx.HTTPError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            logger.exception("OrcaRouter response processing failed: %s", type(error).__name__)
            raise OCRProviderError() from error
        finally:
            if owned_client:
                await client.aclose()


class OpenRouterOCR:
    """OpenRouter API を利用したOCRプロバイダー"""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "openai/gpt-4o-mini",
        client: httpx.AsyncClient | None = None,
        timeout_seconds: float = OCR_TIMEOUT_SECONDS,
    ) -> None:
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        self.model = os.getenv("OPENROUTER_MODEL", model)
        self.endpoint = "https://openrouter.ai/api/v1/chat/completions"
        self.client = client
        self.timeout_seconds = timeout_seconds

    async def extract(self, image: bytes, media_type: str) -> Document:
        if not self.api_key:
            raise OCRProviderError("OPENROUTER_API_KEY is not configured")

        base64_image = base64.b64encode(image).decode("utf-8")
        data_url = f"data:{media_type};base64,{base64_image}"

        prompt = """
        添付された医療機関の領収書・明細書画像から、以下の項目を抽出して指定のJSON形式で返してください。
        読み取れない項目は null にしてください。
        
        抽出項目:
        1. 氏名 (name)
        2. 生年月日 (birth_date: YYYY-MM-DD)
        3. 診療年月日 (service_date: YYYY-MM-DD)
        4. 医療機関名 (provider_name)
        5. 総医療費 (total_medical_cost_yen: 数値)
        6. 自己負担額 (patient_paid_yen: 数値)
        7. 入院/外来 (care_setting: "inpatient" または "outpatient")
        8. 医科/歯科 (discipline: "medical" または "dental")
        9. 保険外費用 (uninsured_cost_yen: 数値)
        10. 差額ベッド代 (private_room_cost_yen: 数値)
        11. 食事療養費 (meal_cost_yen: 数値)
        12. 領収書番号 (receipt_number)
        13. 書類種別 (document_type: "receipt" または "itemized_statement")

        出力フォーマット(JSONのみ):
        {
          "name": "...",
          "birth_date": "YYYY-MM-DD",
          "service_date": "YYYY-MM-DD",
          "provider_name": "...",
          "total_medical_cost_yen": 10000,
          "patient_paid_yen": 3000,
          "care_setting": "outpatient",
          "discipline": "medical",
          "uninsured_cost_yen": 0,
          "private_room_cost_yen": 0,
          "meal_cost_yen": 0,
          "receipt_number": "...",
          "document_type": "receipt"
        }
        """

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
        }

        owned_client = self.client is None
        client = self.client or httpx.AsyncClient(timeout=self.timeout_seconds)

        try:
            response = await client.post(self.endpoint, headers=headers, json=payload)
            if response.status_code != 200:
                raise OCRProviderError()

            res_data = response.json()
            content = res_data["choices"][0]["message"]["content"]
            parsed = json.loads(content)

            digest = image_hash(image)
            service_date_val = parsed.get("service_date")
            service_month_val = service_date_val[:7] if service_date_val else None

            doc_dict = {
                "document_id": f"openrouter-{digest[:20]}",
                "source": "ocr",
                "content_hash": digest,
            }

            fields = [
                "name",
                "birth_date",
                "service_date",
                "provider_name",
                "total_medical_cost_yen",
                "patient_paid_yen",
                "care_setting",
                "discipline",
                "uninsured_cost_yen",
                "private_room_cost_yen",
                "meal_cost_yen",
                "receipt_number",
                "document_type",
            ]

            for field in fields:
                val = parsed.get(field)
                if val in ["null", "None", ""]:
                    val = None

                doc_dict[field] = {
                    "value": val,
                    "confidence": 0.95 if val is not None else 0.0,
                    "confirmed": False,
                }

            doc_dict["service_month"] = {
                "value": service_month_val,
                "confidence": 0.95 if service_month_val else 0.0,
                "confirmed": False,
            }

            doc_dict["raw_text"] = parsed.get("raw_text")
            return Document.model_validate(doc_dict)

        except (httpx.HTTPError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise OCRProviderError() from error
        finally:
            if owned_client:
                await client.aclose()


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
            if not valid_operation_host or not operation_url:
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
    raw_text = "\n".join(line.text for line in lines)
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
            "issue_date": _date_value(
                _field(
                    lines,
                    r"発行日|領収日",
                    r"((?:19|20)\d{2}[年/.\-]\d{1,2}[月/.\-]\d{1,2}日?)",
                )
            ),
            "insurance_covered_amount_yen": _yen(lines, r"保険適用額|保険負担額|保険者負担"),
            "department": _field(
                lines,
                r"診療科|科名|内科|外科|小児科|皮膚科|眼科|耳鼻",
                r"(?:診療科|科名)?\s*[:：]?\s*([^\s:：]{1,30}科)",
            ),
            "insurer_number": _field(
                lines, r"保険者番号", r"(?:保険者番号)?\s*[:：]?\s*([0-9０-９]{6,8})"
            ),
            "insurance_symbol": _field(
                lines, r"記号", r"(?:記号)\s*[:：]?\s*([A-Za-z0-9０-９ぁ-んァ-ヶ一-龠\-]{1,30})"
            ),
            "insurance_member_number": _field(
                lines,
                r"(?:被保険者)?番号",
                r"(?:被保険者)?番号\s*[:：]?\s*([A-Za-z0-9０-９\-]{1,30})",
            ),
            "raw_text": raw_text,
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
    provider = os.getenv("OCR_PROVIDER", "").strip().lower()
    use_mock = os.getenv("USE_MOCK", "").strip().lower()
    endpoint = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
    key = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY")

    # OCR_PROVIDER が指定されている場合は、他のAPIキーより必ず優先する。
    if provider:
        if provider == "mock":
            return MockOCR()
        if provider == "orcarouter":
            if not os.getenv("ORCAROUTER_API_KEY"):
                raise OCRProviderError("ORCAROUTER_API_KEY is not configured")
            return OrcaRouterOCR()
        if provider == "openrouter":
            if not os.getenv("OPENROUTER_API_KEY"):
                raise OCRProviderError("OPENROUTER_API_KEY is not configured")
            return OpenRouterOCR()
        if provider == "azure":
            if not endpoint or not key:
                raise OCRProviderError("Azure OCR settings are not configured")
            return AzureDocumentIntelligenceOCR(endpoint, key)
        raise OCRProviderError(f"Unknown OCR_PROVIDER: {provider}")

    # 後方互換性のため USE_MOCK も解釈する。
    if use_mock in {"1", "true", "yes", "on"}:
        return MockOCR()

    # プロバイダー未指定時のみ、設定済みの資格情報から自動選択する。
    if os.getenv("ORCAROUTER_API_KEY"):
        return OrcaRouterOCR()
    if os.getenv("OPENROUTER_API_KEY"):
        return OpenRouterOCR()
    if endpoint and key and endpoint.startswith("https://"):
        return AzureDocumentIntelligenceOCR(endpoint, key)

    return MockOCR()


def check_exceptions_and_generate_advice(document: Document) -> dict[str, Any]:
    missing_fields = required_review_fields(document)

    if not missing_fields:
        return {"has_exception": False, "issues": [], "agent_advice": None}

    issues = []
    details_for_prompt = []

    for item in missing_fields:
        issue_str = f"【{item['question']}】({item['reason']})"
        issues.append(issue_str)
        details_for_prompt.append(f"- {item['reason']}")

    prompt_issues = "\n".join(details_for_prompt)

    agent_advice = (
        f"【AI Agentからの対応提案】\n"
        f"以下の項目で読み取り不可または基準以下の信頼度が検出されました。\n"
        f"{prompt_issues}\n\n"
        f"【職員の推奨アクション】\n"
        f"1. 添付された画像と該当箇所を目視で再確認・補正してください。\n"
        f"2. 画像鮮明化等で判定が困難な場合は、申請者へ提出の再依頼または確認連絡を行ってください。"
    )

    return {"has_exception": True, "issues": issues, "agent_advice": agent_advice}
