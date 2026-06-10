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
  createdAt?: string;
};

export type Violation = {
  id: string;
  severity: Severity;
  confidence: number;
  quote: string;
  policyName: string;
  policySection: string;
  violatedPolicy?: string | null;
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

export type RewriteResponse = {
  rewrite: string;
};

export type CompanySettings = {
  organizationId: string;
  organizationName: string;
  threshold: number;
  activePolicySet: string;
};

export type HealthResponse = {
  ok: boolean;
  service: string;
  policy_chunks: number;
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

export type ReportInsight = {
  title: string;
  detail: string;
  value: string;
  tone: "success" | "warning" | "danger" | "neutral";
};

export type ReportAction = {
  label: string;
  owner: string;
  priority: "low" | "medium" | "high" | "critical";
  detail: string;
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
  executiveInsights: ReportInsight[];
  actionPlan: ReportAction[];
  evidenceExports: ReportInsight[];
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

export type PolicyFileView = {
  policy: string;
  section: string;
  owner: PolicyOwner;
  version: number;
  chunkCount: number;
  text: string;
  fileUrl?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
};
