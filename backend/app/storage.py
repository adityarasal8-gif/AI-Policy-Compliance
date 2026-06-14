from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from contextlib import contextmanager
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
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM policy_references").fetchall()
        if not rows:
            return None
        return [PolicyReference(**dict(row)) for row in rows]

    def save_references(self, references: list[PolicyReference]) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM policy_references")
            for ref in references:
                data = ref.model_dump(mode="json")
                conn.execute(
                    """
                    INSERT INTO policy_references (id, policy, section, owner, department, text, score, enabled, version, createdAt)
                    VALUES (:id, :policy, :section, :owner, :department, :text, :score, :enabled, :version, :createdAt)
                    """,
                    data
                )

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
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM employees").fetchall()
        return [Employee(**dict(row)) for row in rows]

    def get_employee_by_email(self, email: str) -> Employee | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM employees WHERE email = ?", (email,)).fetchone()
        return Employee(**dict(row)) if row else None

    def save_employees(self, employees: list[Employee]) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM employees")
            for emp in employees:
                data = emp.model_dump(mode="json")
                conn.execute(
                    """
                    INSERT INTO employees (id, email, name, department, role, status, sendEmail, invitedAt, inviteLink, temporaryPassword, emailStatus)
                    VALUES (:id, :email, :name, :department, :role, :status, :sendEmail, :invitedAt, :inviteLink, :temporaryPassword, :emailStatus)
                    """,
                    data
                )

    def get_sessions(self, department: str | None = None, employee_id: str | None = None, limit: int = 50) -> list[SavedSession]:
        query = "SELECT * FROM sessions"
        params = []
        conditions = []
        if employee_id:
            conditions.append("employeeId = ?")
            params.append(employee_id)
        elif department and department not in ("All", "General"):
            conditions.append("department = ?")
            params.append(department)
            
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY createdAt DESC LIMIT ?"
        params.append(limit)
        
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        sessions = []
        for row in rows:
            data = dict(row)
            data["report"] = json.loads(data["report"])
            sessions.append(SavedSession(**data))
        return sessions

    def insert_session(self, session: SavedSession) -> None:
        with self._connect() as conn:
            data = session.model_dump(mode="json")
            data["report"] = json.dumps(data["report"])
            conn.execute(
                """
                INSERT INTO sessions (id, employeeId, documentName, department, team, score, flaggedSections, status, createdAt, report)
                VALUES (:id, :employeeId, :documentName, :department, :team, :score, :flaggedSections, :status, :createdAt, :report)
                """,
                data
            )

    def get_audit_events(self, department: str | None = None, employee_id: str | None = None, limit: int = 100) -> list[AuditEvent]:
        query = "SELECT * FROM audit_events"
        params = []
        conditions = []
        if employee_id:
            conditions.append("employeeId = ?")
            params.append(employee_id)
        elif department and department not in ("All", "General"):
            conditions.append("department = ?")
            params.append(department)
            
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY time DESC LIMIT ?"
        params.append(limit)
        
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [AuditEvent(**dict(row)) for row in rows]

    def insert_audit_event(self, event: AuditEvent) -> None:
        with self._connect() as conn:
            data = event.model_dump(mode="json")
            conn.execute(
                """
                INSERT INTO audit_events (id, employeeId, title, detail, owner, status, time, department, eventType)
                VALUES (:id, :employeeId, :title, :detail, :owner, :status, :time, :department, :eventType)
                """,
                data
            )
            
    def get_audit_event(self, event_id: str) -> AuditEvent | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM audit_events WHERE id = ?", (event_id,)).fetchone()
        return AuditEvent(**dict(row)) if row else None
        
    def update_audit_event(self, event: AuditEvent) -> None:
        with self._connect() as conn:
            data = event.model_dump(mode="json")
            conn.execute(
                """
                UPDATE audit_events 
                SET status = :status, title = :title, detail = :detail, owner = :owner, time = :time, department = :department, eventType = :eventType
                WHERE id = :id
                """,
                data
            )
            
    def get_summary_stats(self, department: str | None = None, employee_id: str | None = None) -> dict:
        params = []
        conditions = []
        if employee_id:
            conditions.append("employeeId = ?")
            params.append(employee_id)
        elif department and department not in ("All", "General"):
            conditions.append("department = ?")
            params.append(department)
            
        where_clause = (" WHERE " + " AND ".join(conditions)) if conditions else ""
        
        with self._connect() as conn:
            sessions_count = conn.execute(f"SELECT COUNT(*) as c FROM sessions{where_clause}", params).fetchone()["c"]
            blocked_count = conn.execute(f"SELECT COUNT(*) as c FROM sessions{where_clause} {'AND status = ?' if conditions else 'WHERE status = ?'}", params + ["blocked"]).fetchone()["c"]
            clean_count = conn.execute(f"SELECT COUNT(*) as c FROM sessions{where_clause} {'AND status = ?' if conditions else 'WHERE status = ?'}", params + ["ready"]).fetchone()["c"]
            
            # Since total violations requires parsing the report JSON in SQLite, 
            # we'll approximate it or sum flaggedSections which is stored as a column!
            total_violations = conn.execute(f"SELECT SUM(flaggedSections) as s FROM sessions{where_clause}", params).fetchone()["s"] or 0
            
            audit_events_count = conn.execute(f"SELECT COUNT(*) as c FROM audit_events{where_clause}", params).fetchone()["c"]
            open_audit_count = conn.execute(f"SELECT COUNT(*) as c FROM audit_events{where_clause} {'AND status = ?' if conditions else 'WHERE status = ?'}", params + ["open"]).fetchone()["c"]
            
        return {
            "total_scans": sessions_count,
            "total_blocked": blocked_count,
            "total_clean": clean_count,
            "total_violations": total_violations,
            "audit_events_count": audit_events_count,
            "open_audit_count": open_audit_count
        }

    def _initialize(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                
                CREATE TABLE IF NOT EXISTS policy_references (
                    id TEXT PRIMARY KEY,
                    policy TEXT NOT NULL,
                    section TEXT NOT NULL,
                    owner TEXT NOT NULL,
                    department TEXT NOT NULL,
                    text TEXT NOT NULL,
                    score REAL,
                    enabled BOOLEAN,
                    version INTEGER,
                    createdAt TEXT
                );
                
                CREATE TABLE IF NOT EXISTS employees (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL,
                    name TEXT NOT NULL,
                    department TEXT NOT NULL,
                    role TEXT NOT NULL,
                    status TEXT NOT NULL,
                    sendEmail BOOLEAN,
                    invitedAt TEXT NOT NULL,
                    inviteLink TEXT,
                    temporaryPassword TEXT,
                    emailStatus TEXT
                );
                
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    employeeId TEXT,
                    documentName TEXT NOT NULL,
                    department TEXT NOT NULL,
                    team TEXT NOT NULL,
                    score INTEGER NOT NULL,
                    flaggedSections INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    createdAt TEXT NOT NULL,
                    report TEXT NOT NULL
                );
                
                CREATE TABLE IF NOT EXISTS audit_events (
                    id TEXT PRIMARY KEY,
                    employeeId TEXT,
                    title TEXT NOT NULL,
                    detail TEXT NOT NULL,
                    owner TEXT NOT NULL,
                    status TEXT NOT NULL,
                    time TEXT NOT NULL,
                    department TEXT NOT NULL,
                    eventType TEXT NOT NULL
                );
                """
            )

    def _migrate_legacy_json(self) -> None:
        pass

    @contextmanager
    def _connect(self) -> Iterable[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        try:
            # We don't automatically use `with conn:` here because callers 
            # already do `with self._connect() as conn:` which handles the transaction.
            yield conn
        finally:
            conn.close()

    def _dump(self, model) -> str:
        return json.dumps(model.model_dump(mode="json"), ensure_ascii=False)
