export type Severity = "low" | "medium" | "high" | "critical";

export type PolicyOwner = "HR" | "Legal" | "Security" | "Finance" | "Compliance";

export type PolicyRule = {
  id: string;
  policy: string;
  section: string;
  rule: string;
  owner: PolicyOwner;
};

export type PolicyReference = {
  id: string;
  policy: string;
  section: string;
  owner: PolicyOwner;
  text: string;
  score?: number;
  enabled?: boolean;
  version?: number;
};

export type Violation = {
  id: string;
  severity: Severity;
  confidence: number;
  quote: string;
  policyName: string;
  policySection: string;
  ruleText: string;
  explanation: string;
  rewrite: string;
  citation?: PolicyReference;
  status?: "open" | "dismissed" | "safe" | "resolved";
};

export type ComplianceReport = {
  id?: string;
  score: number;
  cleanSections: number;
  flaggedSections: number;
  status: "ready" | "review" | "blocked";
  summary?: string;
  source?: "backend" | "local-demo";
  violations: Violation[];
  references?: PolicyReference[];
};

export type AnalyzeRequest = {
  text: string;
  documentName?: string;
  organizationId?: string;
  threshold?: number;
  department?: string;
  team?: string;
};

export type RewriteRequest = {
  text: string;
  violationId?: string;
  policyContext?: string;
};

export type CompanySettings = {
  organizationId: string;
  organizationName: string;
  threshold: number;
  activePolicySet: string;
};

export type Employee = {
  id: string;
  email: string;
  name: string;
  department: string;
  role: "employee" | "admin";
  status: "invited" | "active" | "disabled";
  sendEmail?: boolean;
  invitedAt: string;
  inviteLink?: string;
  temporaryPassword?: string;
  emailStatus?: "sent" | "dev_logged" | "failed";
};

export type SavedSession = {
  id: string;
  documentName: string;
  department: string;
  team: string;
  score: number;
  flaggedSections: number;
  status: string;
  createdAt: string;
  report: ComplianceReport;
};

export type AuditEvent = {
  id: string;
  title: string;
  detail: string;
  owner: string;
  status: "open" | "reviewed";
  time: string;
  department: string;
  eventType: "scan" | "rewrite" | "policy" | "extension" | "user";
};

export type ReportMetric = {
  label: string;
  value: number;
  suffix: string;
  delta: string;
  tone: "success" | "warning" | "danger" | "neutral";
};

export type ReportBar = {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger" | "neutral";
};

export type ReportSummary = {
  role: "admin" | "employee";
  generatedAt: string;
  metrics: ReportMetric[];
  departmentRisk: ReportBar[];
  policyViolations: ReportBar[];
  trend: number[];
  recentSessions: SavedSession[];
  auditEvents: AuditEvent[];
};

export type PolicyComparison = {
  policy: string;
  latestVersion: number;
  previousVersion?: number | null;
  addedTerms: string[];
  removedTerms: string[];
  latestText: string;
  previousText?: string | null;
};
