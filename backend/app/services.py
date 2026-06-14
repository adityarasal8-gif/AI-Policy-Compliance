from __future__ import annotations

import uuid
import os
import secrets
import smtplib
import re
import mimetypes
from urllib.parse import quote
from collections import Counter, defaultdict
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

from .analyzer import analyze_text
from .models import (
    AnalyzeRequest,
    AuditEvent,
    CompanySettings,
    ComplianceReport,
    Employee,
    EmployeeInvite,
    PolicyComparison,
    PolicyReference,
    ReportAction,
    ReportBar,
    ReportInsight,
    ReportMetric,
    ReportSummary,
    SavedSession,
)
from .policy_store import PolicyStore
from .storage import SQLiteStateStore


EMPLOYEE_STATUSES = {"invited", "active", "disabled"}
EMAIL_PATTERN = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
URL_PATTERN = re.compile(r"https?://\S+")
DIGIT_PATTERN = re.compile(r"\b\d{4,}\b")


def _redact_text(value: str) -> str:
    value = EMAIL_PATTERN.sub("[redacted email]", value)
    value = URL_PATTERN.sub("[redacted link]", value)
    value = DIGIT_PATTERN.sub("[redacted id]", value)
    return value


def _sanitize_employee(employee: Employee) -> Employee:
    return employee.model_copy(
        update={
            "email": _redact_text(employee.email),
            "inviteLink": None,
            "temporaryPassword": None,
        }
    )


def _sanitize_report(report: ComplianceReport) -> ComplianceReport:
    sanitized_violations = [
        violation.model_copy(update={"quote": _redact_text(violation.quote), "rewrite": _redact_text(violation.rewrite)})
        for violation in report.violations
    ]
    return report.model_copy(update={"violations": sanitized_violations})


def _sanitize_session(session: SavedSession) -> SavedSession:
    return session.model_copy(
        update={
            "report": _sanitize_report(session.report),
            "documentName": _redact_text(session.documentName or "")
        }
    )


class ComplianceService:
    def __init__(self, data_path: Path) -> None:
        self.storage = SQLiteStateStore(data_path, legacy_json_path=data_path.with_name("state.json"))
        self.upload_dir = data_path.with_name("policy_uploads")
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.policy_store = PolicyStore()
        saved_references = self.storage.load_references()
        if saved_references:
            self.policy_store.load_references(saved_references)
        self.settings = self.storage.load_settings()

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    @property
    def policy_chunk_count(self) -> int:
        return self.policy_store.chunk_count

    def update_settings(self, settings: CompanySettings) -> CompanySettings:
        self.settings = settings
        self.storage.save_settings(settings)
        return settings

    def upload_policy(self, text: str, policy_name: str, section: str, owner: str, department: str = "All", *, raw_bytes: bytes | None = None, original_filename: str | None = None) -> list[PolicyReference]:
        version = 1 + max(
            [reference.version for reference in self.policy_store.references if reference.policy == policy_name] or [0]
        )
        references = self.policy_store.add_policy_text(text=text, policy=policy_name, section=section, owner=owner, department=department, version=version, createdAt=self._now())
        self.storage.save_references(self.policy_store.references)
        if raw_bytes is not None:
            self._save_policy_file(policy_name, version, raw_bytes, original_filename)
        self.add_audit_event(
            title=f"Policy uploaded: {policy_name}",
            detail=f"{len(references)} policy chunks indexed for {owner} as version {version}.",
            owner=owner,
            event_type="policy",
            department=owner,
        )
        return references



    def analyze(self, payload: AnalyzeRequest, employee_id: str | None = None) -> ComplianceReport:
        threshold = payload.threshold if payload.threshold is not None else self.settings.threshold
        default_threshold = CompanySettings().threshold
        if threshold == default_threshold and self.settings.threshold != default_threshold:
            threshold = self.settings.threshold
        report = analyze_text(payload.text, self.policy_store, threshold, department=payload.department)
        self.save_session(payload, report, employee_id=employee_id)
        return report

    def save_session(self, payload: AnalyzeRequest, report: ComplianceReport, employee_id: str | None = None) -> SavedSession:
        stored_report = _sanitize_report(report)
        session = SavedSession(
            id=f"sess-{uuid.uuid4().hex[:10]}",
            employeeId=employee_id,
            documentName=_redact_text(payload.documentName or "Untitled document"),
            department=payload.department,
            team=payload.team,
            score=report.score,
            flaggedSections=report.flaggedSections,
            status=report.status,
            createdAt=self._now(),
            report=stored_report,
        )
        self.storage.insert_session(session)
        self.add_audit_event(
            title="Document analyzed",
            detail=f"{report.flaggedSections} issues found, score {report.score}.",
            owner="ComplyLens",
            event_type="scan",
            department=payload.department,
            employee_id=employee_id,
        )
        return session

    def list_sessions(self, department: str | None = None, employee_id: str | None = None) -> list[SavedSession]:
        sessions = self.storage.get_sessions(department, employee_id, limit=50)
        return [_sanitize_session(s) for s in sessions]

    def invite_employee(self, payload: EmployeeInvite) -> Employee:
        invite_token = secrets.token_urlsafe(18)
        temporary_password = f"CL-{secrets.token_hex(3).upper()}"
        invite_link = f"{os.getenv('COMPLYLENS_APP_URL', 'http://127.0.0.1:5173')}/signup?invite={invite_token}"
        email_status = self._send_invite_email(payload, invite_link, temporary_password) if payload.sendEmail else "dev_logged"
        employee = Employee(
            id=f"emp-{uuid.uuid4().hex[:8]}",
            invitedAt=self._now(),
            inviteLink=invite_link,
            temporaryPassword=temporary_password,
            emailStatus=email_status,
            **payload.model_dump(),
        )
        self.employees = [employee, *self.employees]
        self.storage.save_employees([_sanitize_employee(item) for item in self.employees])
        self.add_audit_event(
            title="Employee invited",
            detail=f"{employee.role} access assigned to {employee.department}. Email delivery status: {employee.emailStatus}.",
            owner="Admin",
            event_type="user",
            department=employee.department,
        )
        return _sanitize_employee(employee)

    def _send_invite_email(self, payload: EmployeeInvite, invite_link: str, temporary_password: str) -> str:
        host = os.getenv("SMTP_HOST")
        if not host:
            return "dev_logged"
        message = EmailMessage()
        message["Subject"] = "Your ComplyLens workspace invite"
        message["From"] = os.getenv("SMTP_FROM", "no-reply@complylens.local")
        message["To"] = payload.email
        message.set_content(
            "\n".join(
                [
                    f"Hi {payload.name},",
                    "",
                    "You have been invited to ComplyLens.",
                    f"Invite link: {invite_link}",
                    f"Temporary password: {temporary_password}",
                    "",
                    "Change this password after your first login.",
                ]
            )
        )
        try:
            port = int(os.getenv("SMTP_PORT", "587"))
            username = os.getenv("SMTP_USER")
            password = os.getenv("SMTP_PASSWORD")
            with smtplib.SMTP(host, port, timeout=10) as smtp:
                smtp.starttls()
                if username and password:
                    smtp.login(username, password)
                smtp.send_message(message)
            return "sent"
        except Exception:
            return "failed"

    def list_employees(self) -> list[Employee]:
        return [_sanitize_employee(employee) for employee in self.storage.load_employees()]

    def update_employee_status(self, employee_id: str, status: str) -> Employee:
        if status not in EMPLOYEE_STATUSES:
            raise ValueError("Invalid status")
        employees = self.storage.load_employees()
        for index, employee in enumerate(employees):
            if employee.id == employee_id:
                updated = employee.model_copy(update={"status": status})
                employees[index] = updated
                self.storage.save_employees(employees)
                return _sanitize_employee(updated)
        raise ValueError("Employee not found")

    def list_policy_versions(self) -> list[PolicyReference]:
        # Group chunked references by uploaded policy so the UI can render one row per file.
        grouped: dict[str, PolicyReference] = {}
        for reference in self.policy_store.references:
            existing = grouped.get(reference.policy)
            if existing is None or (reference.version or 0) >= (existing.version or 0):
                grouped[reference.policy] = reference.model_copy(update={"text": "", "score": None})
        result = list(grouped.values())
        result.sort(key=lambda ref: ref.createdAt or "", reverse=True)
        return result

    def delete_policy(self, policy: str) -> None:
        self.policy_store._chunks = [chunk for chunk in self.policy_store._chunks if chunk.reference.policy != policy]
        self.storage.save_references(self.policy_store.references)
        self.add_audit_event(
            title=f"Policy deleted: {policy}",
            detail="Policy document and all chunks removed.",
            owner="Admin",
            event_type="policy",
            department="Admin",
        )

    def get_policy_view(self, policy: str) -> dict[str, object]:
        references = [reference for reference in self.policy_store.references if reference.policy == policy]
        if not references:
            raise ValueError("Policy not found")
        latest_version = max(reference.version or 1 for reference in references)
        latest_references = [reference for reference in references if (reference.version or 1) == latest_version]
        file_info = self._policy_file_info(policy, latest_version)
        return {
            "policy": policy,
            "section": latest_references[0].section,
            "owner": latest_references[0].owner,
            "version": latest_version,
            "chunkCount": len(latest_references),
            "text": "\n\n".join(reference.text for reference in latest_references).strip(),
            "fileUrl": file_info["fileUrl"] if file_info else None,
            "originalFilename": file_info["originalFilename"] if file_info else None,
            "mimeType": file_info["mimeType"] if file_info else None,
        }

    def _policy_file_info(self, policy: str, version: int) -> dict[str, str] | None:
        policy_dir = self.upload_dir / self._slug(policy) / f"v{version}"
        if not policy_dir.exists():
            return None
        files = [path for path in policy_dir.iterdir() if path.is_file()]
        if not files:
            return None
        file_path = max(files, key=lambda path: path.stat().st_mtime)
        mime_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        return {
            "fileUrl": f"/policies/file?policy={quote(policy)}&version={version}",
            "originalFilename": file_path.name,
            "mimeType": mime_type,
        }

    def get_policy_file(self, policy: str, version: int | None = None) -> tuple[Path, str, str]:
        references = [reference for reference in self.policy_store.references if reference.policy == policy]
        if not references:
            raise ValueError("Policy not found")
        latest_version = version or max(reference.version or 1 for reference in references)
        policy_dir = self.upload_dir / self._slug(policy) / f"v{latest_version}"
        if not policy_dir.exists():
            raise ValueError("Policy file not found")
        files = [path for path in policy_dir.iterdir() if path.is_file()]
        if not files:
            raise ValueError("Policy file not found")
        file_path = max(files, key=lambda path: path.stat().st_mtime)
        mime_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        return file_path, file_path.name, mime_type

    def _save_policy_file(self, policy: str, version: int, raw_bytes: bytes, original_filename: str | None) -> None:
        policy_dir = self.upload_dir / self._slug(policy) / f"v{version}"
        policy_dir.mkdir(parents=True, exist_ok=True)
        safe_name = self._safe_filename(original_filename or f"{self._slug(policy)}.bin")
        file_path = policy_dir / safe_name
        file_path.write_bytes(raw_bytes)

    def _slug(self, value: str) -> str:
        slug = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
        return slug or "policy"

    def _safe_filename(self, value: str) -> str:
        return re.sub(r"[^a-zA-Z0-9._-]+", "-", value).strip("-") or "policy-file"

    def compare_policy_versions(self, policy: str) -> PolicyComparison:
        versions = sorted(
            {reference.version for reference in self.policy_store.references if reference.policy == policy},
            reverse=True,
        )
        if not versions:
            raise ValueError("Policy not found")
        latest_version = versions[0]
        previous_version = versions[1] if len(versions) > 1 else None
        latest_text = " ".join(
            reference.text for reference in self.policy_store.references if reference.policy == policy and reference.version == latest_version
        )
        previous_text = " ".join(
            reference.text for reference in self.policy_store.references if reference.policy == policy and reference.version == previous_version
        ) if previous_version else None
        latest_terms = set(self._meaningful_terms(latest_text))
        previous_terms = set(self._meaningful_terms(previous_text or ""))
        return PolicyComparison(
            policy=policy,
            latestVersion=latest_version,
            previousVersion=previous_version,
            addedTerms=sorted(latest_terms - previous_terms)[:12],
            removedTerms=sorted(previous_terms - latest_terms)[:12],
            latestText=latest_text[:1800],
            previousText=previous_text[:1800] if previous_text else None,
        )

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

    def add_audit_event(self, title: str, detail: str, owner: str, event_type: str, department: str = "General", employee_id: str | None = None) -> AuditEvent:
        event = AuditEvent(
            id=f"audit-{uuid.uuid4().hex[:10]}",
            employeeId=employee_id,
            title=_redact_text(title),
            detail=_redact_text(detail),
            owner=owner,
            status="open",
            time=self._now(),
            department=department,
            eventType=event_type,  # type: ignore[arg-type]
        )
        self.storage.insert_audit_event(event)
        return event

    def list_audit_events(self, department: str | None = None, employee_id: str | None = None) -> list[AuditEvent]:
        events = self.storage.get_audit_events(department, employee_id, limit=100)
        return events

    def mark_audit_reviewed(self, event_id: str) -> AuditEvent:
        event = self.storage.get_audit_event(event_id)
        if event:
            updated = event.model_copy(update={"status": "reviewed"})
            self.storage.update_audit_event(updated)
            return updated
        raise ValueError("Audit event not found")

    def report_summary(self, role: str = "admin", department: str | None = None, employee_id: str | None = None) -> ReportSummary:
        dept = department if department and department != "All" else None
        emp_id = employee_id if role == "employee" else None
        
        stats = self.storage.get_summary_stats(dept, emp_id)
        sessions = self.storage.get_sessions(dept, emp_id, limit=50)
        events = self.storage.get_audit_events(dept, emp_id, limit=50)
        
        if role == "employee":
            events = [event for event in events if event.eventType in {"scan", "rewrite"}]
            
        total_checks = stats["total_scans"]
        risk_prevented = stats["total_violations"]
        clean_sessions = stats["total_clean"]
        blocked_sessions = stats["total_blocked"]
        
        rewrite_candidates = sum(len(session.report.violations) for session in sessions)
        high_risk = sum(1 for session in sessions for violation in session.report.violations if violation.severity in {"high", "critical"})
        
        avg_score = round(sum(session.score for session in sessions) / len(sessions)) if sessions else 100
        clean_rate = round((clean_sessions / total_checks) * 100) if total_checks else 100
        risk_value = risk_prevented * 850 + high_risk * 2400 + blocked_sessions * 1800
        
        open_events = stats["open_audit_count"]
        employees = self.list_employees()
        invited_users = len(employees)
        active_users = len([employee for employee in employees if employee.status == "active"])
        
        if role == "admin":
            metrics = [
                ReportMetric(label="Risk value protected", value=risk_value, suffix="$", delta="estimated exposure avoided", tone="success"),
                ReportMetric(label="Blocked before send", value=blocked_sessions, delta="high-risk drafts stopped", tone="danger" if blocked_sessions else "success"),
                ReportMetric(label="Reviewer workload", value=open_events, delta="open decisions in queue", tone="danger" if open_events else "success"),
                ReportMetric(label="Extension adoption", value=round((active_users / max(invited_users, 1)) * 100), suffix="%", delta="active invited users", tone="success"),
            ]
        else:
            metrics = [
                ReportMetric(label="My checked drafts", value=total_checks, delta="files and messages reviewed", tone="success"),
                ReportMetric(label="Fixes needed", value=rewrite_candidates, delta="sentences to rewrite before sending", tone="warning"),
                ReportMetric(label="Ready to send", value=clean_rate, suffix="%", delta="drafts with no risky sections", tone="success"),
                ReportMetric(label="Writing safety", value=avg_score, suffix="%", delta="average safe-language score", tone="success" if avg_score >= 80 else "warning"),
            ]
        department_counts: defaultdict[str, int] = defaultdict(int)
        policy_counts: Counter[str] = Counter()
        trend_counts: defaultdict[str, int] = defaultdict(int)
        for session in sessions:
            department_counts[session.department] += session.flaggedSections or 1
            trend_counts[session.createdAt[:10]] += session.flaggedSections
            for violation in session.report.violations:
                policy_counts[violation.policyName] += 1
        max_department = max(department_counts.values() or [1])
        max_policy = max(policy_counts.values() or [1])
        department_risk = [
            ReportBar(label=label, value=round((value / max_department) * 100), tone="danger" if value >= max_department else "warning")
            for label, value in sorted(department_counts.items(), key=lambda item: item[1], reverse=True)[:6]
        ]
        policy_violations = [
            ReportBar(label=label, value=round((value / max_policy) * 100), tone="warning")
            for label, value in policy_counts.most_common(6)
        ]
        trend = [trend_counts[key] for key in sorted(trend_counts.keys())[-8:]]
        if not trend:
            trend = [0]
        top_department = max(department_counts.items(), key=lambda item: item[1], default=("No department", 0))
        top_policy = policy_counts.most_common(1)[0] if policy_counts else ("No repeated policy", 0)
        team_counts: Counter[str] = Counter()
        phrase_counts: Counter[str] = Counter()
        for session in sessions:
            team_counts[f"{session.department} / {session.team}"] += session.flaggedSections
            for violation in session.report.violations:
                phrase_counts[violation.quote[:54]] += 1
        top_team = team_counts.most_common(1)[0] if team_counts else ("No team risk", 0)
        risky_phrase = phrase_counts.most_common(1)[0] if phrase_counts else ("No repeated risky phrase", 0)
        if role == "admin":
            executive_insights = [
                ReportInsight(title="Financial risk prevented", value=f"${risk_value:,}", detail=f"{risk_prevented} findings and {blocked_sessions} blocked drafts converted into estimated avoided exposure.", tone="success"),
                ReportInsight(title="Top risky department", value=top_department[0], detail=f"{top_department[1]} risk signals. Start coaching and policy refresh here first.", tone="warning" if top_department[1] else "neutral"),
                ReportInsight(title="Policy drift", value=top_policy[0], detail=f"{top_policy[1]} recent findings map to this policy. Compare latest policy version before more reviews pile up.", tone="warning" if top_policy[1] else "neutral"),
                ReportInsight(title="Reviewer SLA", value=f"{open_events} open", detail="Open audit events should be cleared before end of business day for critical communications.", tone="danger" if open_events else "success"),
                ReportInsight(title="Repeat offender", value=top_team[0], detail=f"{top_team[1]} risk signals by team/document stream. Create a targeted playbook.", tone="warning" if top_team[1] else "neutral"),
                ReportInsight(title="Extension adoption", value=f"{active_users}/{invited_users}", detail="Active employee accounts indicate extension rollout readiness and training coverage.", tone="success"),
            ]
            action_plan = [
                ReportAction(label="Department coaching plan", owner="Compliance lead", priority="high" if top_department[1] else "medium", detail="Create approved-language examples for the highest-risk department and assign policy coaching."),
                ReportAction(label=f"Refresh {top_policy[0]}", owner="Policy owner", priority="high" if top_policy[1] else "medium", detail="Upload the latest policy, compare version changes, then disable stale chunks."),
                ReportAction(label="Clear reviewer queue", owner="Legal reviewer", priority="critical" if open_events > 5 else "medium", detail="Resolve open audit events and export evidence for critical scans."),
                ReportAction(label="Deploy extension to remaining users", owner="IT admin", priority="medium", detail="Invite employees and verify extension activation before the next review window."),
            ]
            evidence_exports = [
                ReportInsight(title="Audit packet", value=f"{len(events)} events", detail="Export audit trail with scans, invites, policy updates, and reviewer decisions.", tone="neutral"),
                ReportInsight(title="Blocked-message evidence", value=str(blocked_sessions), detail="Attach high-risk blocked scans to legal review packs.", tone="danger" if blocked_sessions else "success"),
                ReportInsight(title="Policy evidence", value=str(len(self.policy_store.references)), detail="Show active policy chunks and version status during compliance review.", tone="neutral"),
            ]
        else:
            needs_rewrite = [session for session in sessions if session.flaggedSections > 0]
            executive_insights = [
                ReportInsight(title="Ready to send", value=str(clean_sessions), detail="Recent clean drafts are ready without exposing their original names in the summary.", tone="success"),
                ReportInsight(title="Needs rewrite", value=str(len(needs_rewrite)), detail="Open these drafts, apply safe rewrites, and run analysis again before sending.", tone="warning" if needs_rewrite else "success"),
                ReportInsight(title="Repeated risky phrase", value=risky_phrase[0], detail=f"Seen {risky_phrase[1]} times. Avoid this wording in future customer or HR communication.", tone="warning" if risky_phrase[1] else "neutral"),
                ReportInsight(title="Plain-language improvement", value=f"{clean_rate}%", detail="This is the share of your checked drafts that were already safe enough to send.", tone="success" if clean_rate >= 70 else "warning"),
                ReportInsight(title="Accepted rewrites", value=str(rewrite_candidates), detail="Use the suggested rewrites for these findings, then re-check the draft.", tone="neutral"),
            ]
            action_plan = [
                ReportAction(label="Private draft", owner="You", priority="high" if session.status == "blocked" else "medium", detail=f"{session.flaggedSections} findings. Rewrite before sending.")
                for session in needs_rewrite[:4]
            ] or [
                ReportAction(label="No rewrite work", owner="You", priority="low", detail="Your recent drafts are clean. Keep checking customer, vendor, HR, and legal messages.")
            ]
            evidence_exports = [
                ReportInsight(title="Private draft", value="Clean" if session.flaggedSections == 0 else "Needs rewrite", detail=f"{session.score}% safety score. Export if a manager needs proof.", tone="success" if session.flaggedSections == 0 else "warning")
                for session in sessions[:4]
            ]
        return ReportSummary(
            role="admin" if role == "admin" else "employee",
            generatedAt=self._now(),
            metrics=metrics,
            departmentRisk=department_risk,
            policyViolations=policy_violations,
            trend=trend,
            recentSessions=sessions[:8],
            auditEvents=events[:8],
            executiveInsights=executive_insights,
            actionPlan=action_plan,
            evidenceExports=evidence_exports,
        )

    def _meaningful_terms(self, text: str) -> list[str]:
        stop_words = {"the", "and", "for", "with", "must", "shall", "that", "this", "from", "into", "only", "before", "after"}
        words = [word.lower().strip(".,:;()[]") for word in text.split()]
        return [word for word in words if len(word) > 4 and word not in stop_words]
