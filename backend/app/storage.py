from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Iterable

from .models import AuditEvent, CompanySettings, Employee, PolicyReference, SavedSession


class SQLiteStateStore:
    def __init__(self, path: Path, legacy_json_path: Path | None = None) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.legacy_json_path = legacy_json_path
        self._initialize()
        self._migrate_legacy_json()

    def load_references(self) -> list[PolicyReference] | None:
        items = self._load_collection("policy_references", PolicyReference)
        return items or None

    def save_references(self, references: list[PolicyReference]) -> None:
        self._save_collection("policy_references", references)

    def load_settings(self) -> CompanySettings:
        with self._connect() as conn:
            row = conn.execute("SELECT value FROM settings WHERE key = ?", ("company",)).fetchone()
        if not row:
            return CompanySettings()
        try:
            return CompanySettings.model_validate(json.loads(row["value"]))
        except Exception:
            return CompanySettings()

    def save_settings(self, settings: CompanySettings) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                ("company", self._dump(settings)),
            )

    def load_employees(self) -> list[Employee]:
        return self._load_collection("employees", Employee)

    def save_employees(self, employees: list[Employee]) -> None:
        self._save_collection("employees", employees)

    def load_sessions(self) -> list[SavedSession]:
        return self._load_collection("sessions", SavedSession)

    def save_sessions(self, sessions: list[SavedSession]) -> None:
        self._save_collection("sessions", sessions)

    def load_audit_events(self) -> list[AuditEvent]:
        return self._load_collection("audit_events", AuditEvent)

    def save_audit_events(self, events: list[AuditEvent]) -> None:
        self._save_collection("audit_events", events)

    def _initialize(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS collections (
                    kind TEXT NOT NULL,
                    id TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    value TEXT NOT NULL,
                    PRIMARY KEY (kind, id)
                );
                CREATE INDEX IF NOT EXISTS idx_collections_kind_position
                    ON collections(kind, position);
                """
            )

    def _migrate_legacy_json(self) -> None:
        if not self.legacy_json_path or not self.legacy_json_path.exists():
            return
        with self._connect() as conn:
            has_rows = conn.execute("SELECT COUNT(*) AS count FROM collections").fetchone()["count"]
            has_settings = conn.execute("SELECT COUNT(*) AS count FROM settings").fetchone()["count"]
        if has_rows or has_settings:
            return
        try:
            state = json.loads(self.legacy_json_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return
        if state.get("settings"):
            self.save_settings(CompanySettings.model_validate(state["settings"]))
        collection_models = {
            "policy_references": PolicyReference,
            "employees": Employee,
            "sessions": SavedSession,
            "audit_events": AuditEvent,
        }
        for kind, model in collection_models.items():
            items = [model.model_validate(item) for item in state.get(kind, [])]
            self._save_collection(kind, items)

    def _load_collection(self, kind: str, model) -> list:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT value FROM collections WHERE kind = ? ORDER BY position ASC",
                (kind,),
            ).fetchall()
        parsed_items = []
        for row in rows:
            try:
                parsed_items.append(model.model_validate(json.loads(row["value"])))
            except Exception:
                continue
        return parsed_items

    def _save_collection(self, kind: str, items: Iterable) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM collections WHERE kind = ?", (kind,))
            conn.executemany(
                "INSERT INTO collections(kind, id, position, value) VALUES(?, ?, ?, ?)",
                [
                    (kind, getattr(item, "id", f"{kind}-{index}"), index, self._dump(item))
                    for index, item in enumerate(items)
                ],
            )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def _dump(self, model) -> str:
        return json.dumps(model.model_dump(mode="json"), ensure_ascii=False)
