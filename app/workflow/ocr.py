from io import BytesIO
from typing import Protocol

from PIL import Image, UnidentifiedImageError

from app.workflow.models import Document

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000


class OCRProvider(Protocol):
    async def extract(self, image: bytes, media_type: str) -> Document: ...


def validate_image(data: bytes, media_type: str) -> None:
    try:
        with Image.open(BytesIO(data)) as image:
            expected = {"image/png": "PNG", "image/jpeg": "JPEG"}.get(media_type)
            if image.format != expected or image.width * image.height > MAX_IMAGE_PIXELS:
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
                **{
                    key: {"value": value, "confidence": 0.98, "confirmed": False}
                    for key, value in {
                        "name": "架空の患者A",
                        "birth_date": "1980-01-15",
                        "service_month": "2026-07",
                        "provider_name": "架空病院A",
                        "total_medical_cost_yen": 1000000,
                        "patient_paid_yen": 300000,
                        "care_setting": "inpatient",
                        "discipline": "medical",
                    }.items()
                },
            }
        )


def get_ocr_provider() -> OCRProvider:
    return MockOCR()
