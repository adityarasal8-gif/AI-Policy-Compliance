import {
  type AuditEvent,
  type ComplianceReport,
  type Employee,
  type HealthResponse,
  type PolicyComparison,
  type PolicyFileView,
  type PolicyReference,
  type ReportSummary,
  type RewriteResponse,
  type SavedSession
} from "@complylens/shared";
import { firebaseServices } from "../auth/firebase";

const API_BASE_URL = "http://localhost:8000";

async function getAuthHeaders(headers?: HeadersInit) {
  const nextHeaders = new Headers(headers);
  const token = await firebaseServices?.auth.currentUser?.getIdToken();

  if (token) {
    nextHeaders.set("Authorization", `Bearer ${token}`);
  }

  return nextHeaders;
}

async function requestJson<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: await getAuthHeaders(init.headers)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

export async function analyzeDocument(input: {
  text: string;
  documentName: string;
  threshold: number;
  department?: string;
  team?: string;
}) {
  return requestJson<ComplianceReport>("/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function getHealth() {
  return requestJson<HealthResponse>("/health");
}

export async function rewriteComplianceText(input: {
  text: string;
  policyContext?: string;
  violationId?: string;
}) {
  return requestJson<RewriteResponse>("/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function analyzeUploadedDocument(file: File, threshold: number, department = "General", team = "Workspace") {
  const body = new FormData();
  body.append("file", file);
  body.append("threshold", String(threshold));
  body.append("department", department);
  body.append("team", team);
  return requestJson<{ text: string; report: ComplianceReport }>("/analyze-upload", { method: "POST", body });
}

export async function uploadPolicyDocument(file: File) {
  const body = new FormData();
  body.append("file", file);
  body.append("policy_name", file.name.replace(/\.(pdf|doc|docx|eml|html|htm|md|rtf|txt)$/i, ""));
  return requestJson<{ uploaded: boolean; chunks: number }>("/upload-policy", { method: "POST", body });
}

export async function saveCompanySettings(payload: {
  organizationId: string;
  organizationName: string;
  threshold: number;
  activePolicySet: string;
}) {
  return requestJson("/settings/company", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function listEmployees() {
  return requestJson<Employee[]>("/employees");
}

export async function inviteEmployee(payload: {
  email: string;
  name: string;
  department: string;
  role: "employee" | "admin";
  sendEmail?: boolean;
}) {
  return requestJson<Employee>("/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function updateEmployeeStatus(employeeId: string, status: Employee["status"]) {
  return requestJson<Employee>(`/employees/${employeeId}/status?status=${encodeURIComponent(status)}`, { method: "PATCH" });
}

export async function listSavedSessions(department = "All") {
  return requestJson<SavedSession[]>(`/sessions?department=${encodeURIComponent(department)}`);
}

export async function listAuditEvents(department = "All") {
  return requestJson<AuditEvent[]>(`/audit-events?department=${encodeURIComponent(department)}`);
}

export async function markAuditEventReviewed(eventId: string) {
  return requestJson<AuditEvent>(`/audit-events/${eventId}/reviewed`, { method: "PATCH" });
}

export async function listPolicyVersions() {
  return requestJson<PolicyReference[]>("/policies");
}

export async function comparePolicyVersions(policy: string) {
  return requestJson<PolicyComparison>(`/policies/compare?policy=${encodeURIComponent(policy)}`);
}

export async function viewPolicyFile(policy: string) {
  return requestJson<PolicyFileView>(`/policies/view?policy=${encodeURIComponent(policy)}`);
}

export function getPolicyFileUrl(policy: string, version?: number) {
  const params = new URLSearchParams({ policy });
  if (version) params.set("version", String(version));
  return `${API_BASE_URL}/policies/file?${params.toString()}`;
}

export async function getReportSummary(role: "admin" | "employee", department = "All") {
  return requestJson<ReportSummary>(`/reports/summary?role=${encodeURIComponent(role)}&department=${encodeURIComponent(department)}`);
}

export async function togglePolicyReference(referenceId: string, enabled: boolean) {
  return requestJson<PolicyReference>(`/policies/${referenceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled })
  });
}

export async function deletePolicyDocument(policy: string) {
  return requestJson<{ deleted: boolean; policy: string }>(`/policies/${encodeURIComponent(policy)}`, { method: "DELETE" });
}
