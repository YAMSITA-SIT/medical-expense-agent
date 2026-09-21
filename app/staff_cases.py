from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any


# プロジェクト直下の data/staff_uploads.db に保存する
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_DATABASE_DIRECTORY = _PROJECT_ROOT / "data"
_DATABASE_PATH = _DATABASE_DIRECTORY / "staff_uploads.db"

_lock = Lock()


def _connect() -> sqlite3.Connection:
    """SQLiteデータベースへ接続する。"""

    _DATABASE_DIRECTORY.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(_DATABASE_PATH)
    connection.row_factory = sqlite3.Row

    return connection


def _initialize_database() -> None:
    """履歴保存用のテーブルを作成する。"""

    with _connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS staff_upload_history (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                received_at TEXT NOT NULL,
                history_json TEXT NOT NULL
            )
            """
        )
        connection.commit()


def register_upload(
    *,
    source: str,
    duplicate_suspected: bool,
    quality_issues: list[str],
) -> None:
    """
    個人情報を含まないアップロード履歴をSQLiteへ保存する。

    画像、氏名、医療費、OCR抽出結果などは保存しない。
    """

    now = datetime.now(timezone.utc)
    received_at = now.isoformat()

    with _lock:
        with _connect() as connection:
            # 先に連番を確保する
            cursor = connection.execute(
                """
                INSERT INTO staff_upload_history (
                    received_at,
                    history_json
                )
                VALUES (?, ?)
                """,
                (
                    received_at,
                    "{}",
                ),
            )

            sequence = cursor.lastrowid

            if sequence is None:
                raise RuntimeError("アップロード履歴の連番を取得できませんでした")

            history: dict[str, Any] = {
                "id": f"UPLOAD-{now:%Y%m%d}-{sequence:04d}",
                "receivedAt": received_at,

                # 個人情報は保存しない
                "applicantName": "非表示",
                "birthDate": "",
                "age": 0,
                "insurance": "非表示",
                "incomeCategory": "非表示",
                "serviceMonth": "非表示",
                "providerName": "非表示",
                "careSetting": "外来",
                "discipline": "医科",
                "program": "未判定",
                "claimedAmountYen": 0,

                "status": "ocr_review",
                "priority": "normal",
                "requiresAttention": True,

                "document": {
                    "filename": "保存していません",
                    "submittedAt": received_at,
                    "ocrProvider": source,
                    "duplicateSuspected": duplicate_suspected,
                    "qualityIssues": quality_issues,
                },

                # OCR結果・金額・氏名などは保存しない
                "ocrFields": [],

                "calculation": {
                    "eligibility": "追加情報が必要",
                    "selfPaymentLimitYen": None,
                    "estimatedBenefitYen": None,
                    "inputs": [],
                    "formula": None,
                    "reasons": [
                        "開発用履歴では個人情報と医療情報を保存していません"
                    ],
                    "appliedRules": [],
                    "exceptionCodes": [],
                    "missingInformation": [],
                    "source": "api",
                },

                "auditLog": [
                    {
                        "id": f"received-{sequence}",
                        "timestamp": received_at,
                        "actor": "システム",
                        "action": "画像アップロードを受け付け",
                        "after": "OCR確認待ち",
                    }
                ],
            }

            history_json = json.dumps(
                history,
                ensure_ascii=False,
                separators=(",", ":"),
            )

            connection.execute(
                """
                UPDATE staff_upload_history
                SET history_json = ?
                WHERE sequence = ?
                """,
                (
                    history_json,
                    sequence,
                ),
            )

            connection.commit()


def list_upload_history() -> list[dict[str, Any]]:
    """保存されているアップロード履歴を新しい順に取得する。"""

    with _lock:
        with _connect() as connection:
            rows = connection.execute(
                """
                SELECT history_json
                FROM staff_upload_history
                ORDER BY sequence DESC
                """
            ).fetchall()

    histories: list[dict[str, Any]] = []

    for row in rows:
        try:
            history = json.loads(row["history_json"])
        except (json.JSONDecodeError, TypeError):
            continue

        if isinstance(history, dict):
            histories.append(history)

    return histories


_initialize_database()