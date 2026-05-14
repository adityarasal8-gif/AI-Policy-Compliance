from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


Severity = Literal["low", "medium", "high", "critical"]


class PolicyReference(BaseModel):
    id: str
    policy: str
    section: str
    owner: str
    text: str
    score: float = 0
    enabled: bool = True
    version: int = 1


class Violation(BaseModel):
    id: str
    severity: Severity
    confidence: float = Field(ge=0, le=1)
    quote: str
    policyName: str
    policySection: str
    ruleText: str
    explanation: str
    rewrite: str
    citation: PolicyReference
    status: Literal["open", "dismissed", "safe", "resolved"] = "open"


class ComplianceReport(BaseModel):
    id: str
    score: int = Field(ge=0, le=100)
    cleanSections: int
    flaggedSections: int
    status: Literal["ready", "review", "blocked"]
    summary: str
    source: Literal["backend"]
    violations: list[Violation]
    references: list[PolicyReference]


class AnalyzeRequest(BaseModel):
    text: str
    documentName: str | None = None
    organizationId: str = "demo-org"
    threshold: float = Field(default=0.62, ge=0, le=1)
    department: str = "General"
    team: str = "Workspace"


class RewriteRequest(BaseModel):
    text: str
    violationId: str | None = None
    policyContext: str | None = None


class RewriteResponse(BaseModel):
    rewrite: str


class CompanySettings(BaseModel):
    organizationId: str = "demo-org"
    organizationName: str = "Demo Enterprise"
    threshold: float = Field(default=0.62, ge=0, le=1)
    activePolicySet: str = "seeded-enterprise-policy"


class HealthResponse(BaseModel):
    ok: bool
    service: str
    policy_chunks: int


class EmployeeInvite(BaseModel):
    email: str
    name: str = "New employee"
    department: str = "General"
    role: Literal["employee", "admin"] = "employee"
    status: Literal["invited", "active", "disabled"] = "invited"
    sendEmail: bool = True


class Employee(EmployeeInvite):
    id: str
    invitedAt: str
    inviteLink: str | None = None
    temporaryPassword: str | None = None
    emailStatus: Literal["sent", "dev_logged", "failed"] = "dev_logged"


class SavedSession(BaseModel):
    id: str
    documentName: str
    department: str = "General"
    team: str = "Workspace"
    score: int
    flaggedSections: int
    status: str
    createdAt: str
    report: ComplianceReport


class AuditEvent(BaseModel):
    id: str
    title: str
    detail: str
    owner: str = "Compliance"
    status: Literal["open", "reviewed"] = "open"
    time: str
    department: str = "General"
    eventType: Literal["scan", "rewrite", "policy", "extension", "user"] = "scan"


class PolicyToggle(BaseModel):
    enabled: bool


class ReportMetric(BaseModel):
    label: str
    value: int
    suffix: str = ""
    delta: str = ""
    tone: Literal["success", "warning", "danger", "neutral"] = "neutral"


class ReportBar(BaseModel):
    label: str
    value: int
    tone: Literal["success", "warning", "danger", "neutral"] = "neutral"


class ReportSummary(BaseModel):
    role: Literal["admin", "employee"]
    generatedAt: str
    metrics: list[ReportMetric]
    departmentRisk: list[ReportBar]
    policyViolations: list[ReportBar]
    trend: list[int]
    recentSessions: list[SavedSession]
    auditEvents: list[AuditEvent]


class PolicyComparison(BaseModel):
    policy: str
    latestVersion: int
    previousVersion: int | None = None
    addedTerms: list[str]
    removedTerms: list[str]
    latestText: str
    previousText: str | None = None
