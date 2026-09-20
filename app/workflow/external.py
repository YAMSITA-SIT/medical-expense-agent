from typing import Protocol

from app.workflow.models import Model


class ExternalEvidence(Model):
    receipt_state: str | None = None
    duplicate_application: bool | None = None
    household_verified: bool | None = None
    benefit_history_verified: bool | None = None
    source: str = "not_connected"


class EvidenceGateway(Protocol):
    """Future authorized API/MCP adapter. Never infer absence from missing data."""

    async def fetch(self, case_id: str) -> ExternalEvidence: ...


class MockEvidenceGateway:
    async def fetch(self, case_id: str) -> ExternalEvidence:
        return ExternalEvidence(source="fictional_mock")
