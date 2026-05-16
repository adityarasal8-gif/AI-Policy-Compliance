from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from .analyzer import analyze_text
from .models import AnalyzeRequest, AuditEvent, CompanySettings, ComplianceReport, Employee, EmployeeInvite, PolicyReference, SavedSession
from .policy_store import PolicyStore
from .storage import JsonStateStore


EMPLOYEE_STATUSES = {"invited", "active", "disabled"}


class ComplianceService:
    def __init__(self, data_path: Path) -> None:
        self.storage = JsonStateStore(data_path)
        self.policy_store = PolicyStore()
        saved_references = self.storage.load_references()
        if saved_references:
            self.policy_store.load_references(saved_references)
        self.settings = self.storage.load_settings()
        self.employees = self.storage.load_employees()
        self.sessions = self.storage.load_sessions()
        self.audit_events = self.storage.load_audit_events()

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    @property
    def policy_chunk_count(self) -> int:
        return self.policy_store.chunk_count

    def update_settings(self, settings: CompanySettings) -> CompanySettings:
        self.settings = settings
        self.storage.save_settings(settings)
        return settings

    def upload_policy(self, text: str, policy_name: str, section: str, owner: str) -> list[PolicyReference]:
        references = self.policy_store.add_policy_text(text=text, policy=policy_name, section=section, owner=owner)
        self.storage.save_references(self.policy_store.references)
        self.add_audit_event(
            title=f"Policy uploaded: {policy_name}",
            detail=f"{len(references)} policy chunks indexed for {owner}.",
            owner=owner,
            event_type="policy",
            department=owner,
        )
        return references

    def analyze(self, payload: AnalyzeRequest) -> ComplianceReport:
        threshold = payload.threshold if payload.threshold is not None else self.settings.threshold
        default_threshold = CompanySettings().threshold
        if threshold == default_threshold and self.settings.threshold != default_threshold:
            threshold = self.settings.threshold
        report = analyze_text(payload.text, self.policy_store, threshold)
        self.save_session(payload, report)
        return report

    def save_session(self, payload: AnalyzeRequest, report: ComplianceReport) -> SavedSession:
        session = SavedSession(
            id=f"sess-{uuid.uuid4().hex[:10]}",
            documentName=payload.documentName or "Untitled document",
            department=payload.department,
            team=payload.team,
            score=report.score,
            flaggedSections=report.flaggedSections,
            status=report.status,
            createdAt=self._now(),
            report=report,
        )
        self.sessions = [session, *self.sessions[:49]]
        self.storage.save_sessions(self.sessions)
        self.add_audit_event(
            title=f"Document analyzed: {session.documentName}",
            detail=f"{report.flaggedSections} issues found, score {report.score}.",
            owner="ComplyLens",
            event_type="scan",
            department=payload.department,
        )
        return session

    def list_sessions(self, department: str | None = None) -> list[SavedSession]:
        if not department or department == "All":
            return self.sessions
        return [session for session in self.sessions if session.department == department]

    def invite_employee(self, payload: EmployeeInvite) -> Employee:
        employee = Employee(id=f"emp-{uuid.uuid4().hex[:8]}", invitedAt=self._now(), **payload.model_dump())
        self.employees = [employee, *self.employees]
        self.storage.save_employees(self.employees)
        self.add_audit_event(
            title=f"Employee invited: {employee.email}",
            detail=f"{employee.role} access assigned to {employee.department}.",
            owner="Admin",
            event_type="user",
            department=employee.department,
        )
        return employee

    def list_employees(self) -> list[Employee]:
        return self.employees

    def update_employee_status(self, employee_id: str, status: str) -> Employee:
        if status not in EMPLOYEE_STATUSES:
            raise ValueError("Invalid status")
        for index, employee in enumerate(self.employees):
            if employee.id == employee_id:
                updated = employee.model_copy(update={"status": status})
                self.employees[index] = updated
                self.storage.save_employees(self.employees)
                return updated
        raise ValueError("Employee not found")

    def list_policy_versions(self) -> list[PolicyReference]:
        return self.policy_store.references

    def toggle_policy(self, reference_id: str, enabled: bool) -> PolicyReference:
        references = self.policy_store.references
        for index, reference in enumerate(references):
            if reference.id == reference_id:
                updated = reference.model_copy(update={"enabled": enabled, "version": reference.version + 1})
                references[index] = updated
                self.policy_store.load_references(references)
                self.storage.save_references(references)
                self.add_audit_event(
                    title=f"Policy {'enabled' if enabled else 'disabled'}: {updated.policy}",
                    detail=f"{updated.section} moved to version {updated.version}.",
                    owner=updated.owner,
                    event_type="policy",
                    department=updated.owner,
                )
                return updated
        raise ValueError("Policy reference not found")

    def add_audit_event(self, title: str, detail: str, owner: str, event_type: str, department: str = "General") -> AuditEvent:
        event = AuditEvent(
            id=f"audit-{uuid.uuid4().hex[:10]}",
            title=title,
            detail=detail,
            owner=owner,
            status="open",
            time=self._now(),
            department=department,
            eventType=event_type,  # type: ignore[arg-type]
        )
        self.audit_events = [event, *self.audit_events[:99]]
        self.storage.save_audit_events(self.audit_events)
        return event

    def list_audit_events(self, department: str | None = None) -> list[AuditEvent]:
        if not self.audit_events:
            return []
        if not department or department == "All":
            return self.audit_events
        return [event for event in self.audit_events if event.department == department]

    def mark_audit_reviewed(self, event_id: str) -> AuditEvent:
        for index, event in enumerate(self.audit_events):
            if event.id == event_id:
                updated = event.model_copy(update={"status": "reviewed"})
                self.audit_events[index] = updated
                self.storage.save_audit_events(self.audit_events)
                return updated
        raise ValueError("Audit event not found")
