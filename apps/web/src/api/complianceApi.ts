import {
  API_BASE_URL,
  type AuditEvent,
  type ComplianceReport,
  type Employee,
  type PolicyComparison,
  type PolicyReference,
  type ReportSummary,
  type SavedSession
} from "@complylens/shared";

export async function analyzeDocument(input: {
  text: string;
  documentName: string;
  threshold: number;
  department?: string;
  team?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as ComplianceReport;
}

export async function analyzeUploadedDocument(file: File, threshold: number, department = "General", team = "Workspace") {
  const body = new FormData();
  body.append("file", file);
  body.append("threshold", String(threshold));
  body.append("department", department);
  body.append("team", team);
  const response = await fetch(`${API_BASE_URL}/analyze-upload`, { method: "POST", body });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as { text: string; report: ComplianceReport };
}

export async function uploadPolicyDocument(file: File) {
  const body = new FormData();
  body.append("file", file);
  body.append("policy_name", file.name.replace(/\.(pdf|doc|docx|eml|html|htm|md|rtf|txt)$/i, ""));
  const response = await fetch(`${API_BASE_URL}/upload-policy`, { method: "POST", body });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as { uploaded: boolean; chunks: number };
}

export async function saveCompanySettings(payload: {
  organizationId: string;
  organizationName: string;
  threshold: number;
  activePolicySet: string;
}) {
  const response = await fetch(`${API_BASE_URL}/settings/company`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function listEmployees() {
  const response = await fetch(`${API_BASE_URL}/employees`);
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as Employee[];
}

export async function inviteEmployee(payload: {
  email: string;
  name: string;
  department: string;
  role: "employee" | "admin";
  sendEmail?: boolean;
}) {
  const response = await fetch(`${API_BASE_URL}/employees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as Employee;
}

export async function updateEmployeeStatus(employeeId: string, status: Employee["status"]) {
  const response = await fetch(`${API_BASE_URL}/employees/${employeeId}/status?status=${encodeURIComponent(status)}`, { method: "PATCH" });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as Employee;
}

export async function listSavedSessions(department = "All") {
  const response = await fetch(`${API_BASE_URL}/sessions?department=${encodeURIComponent(department)}`);
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as SavedSession[];
}

export async function listAuditEvents(department = "All") {
  const response = await fetch(`${API_BASE_URL}/audit-events?department=${encodeURIComponent(department)}`);
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as AuditEvent[];
}

export async function markAuditEventReviewed(eventId: string) {
  const response = await fetch(`${API_BASE_URL}/audit-events/${eventId}/reviewed`, { method: "PATCH" });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as AuditEvent;
}

export async function listPolicyVersions() {
  const response = await fetch(`${API_BASE_URL}/policies`);
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as PolicyReference[];
}

export async function comparePolicyVersions(policy: string) {
  const response = await fetch(`${API_BASE_URL}/policies/compare?policy=${encodeURIComponent(policy)}`);
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as PolicyComparison;
}

export async function getReportSummary(role: "admin" | "employee", department = "All") {
  const response = await fetch(`${API_BASE_URL}/reports/summary?role=${encodeURIComponent(role)}&department=${encodeURIComponent(department)}`);
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as ReportSummary;
}

export async function togglePolicyReference(referenceId: string, enabled: boolean) {
  const response = await fetch(`${API_BASE_URL}/policies/${referenceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled })
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as PolicyReference;
}
