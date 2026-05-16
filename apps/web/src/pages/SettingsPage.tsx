import { FormEvent, useEffect, useState } from "react";
import { BarChart3, Bell, CheckCircle2, Gauge, KeyRound, Palette, Puzzle, RefreshCw, ShieldCheck, SlidersHorizontal, UserPlus, UsersRound } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { inviteEmployee, listEmployees, saveCompanySettings, updateEmployeeStatus } from "../api/complianceApi";
import { NoticeBox } from "../components/common/NoticeBox";
import { PanelTitle } from "../components/common/PanelTitle";
import { WorkspaceShell } from "../layouts/WorkspaceShell";
import type { Notice } from "../types";
import type { Employee } from "@complylens/shared";

const adminReports = [
  { label: "Risk stopped", value: "38", note: "messages blocked this month" },
  { label: "Top policy", value: "Privacy", note: "most common violation" },
  { label: "Rewrite use", value: "74%", note: "accepted safe rewrites" }
];

const employeePreferences = [
  { title: "File checks", copy: "PDF, DOCX, email, and typed text scans stay available from Workspace.", icon: ShieldCheck },
  { title: "History", copy: "Your previous checks are listed in the History tab and beside the workspace.", icon: Bell },
  { title: "Assigned by admin", copy: "Admins manage policy uploads, access, and company rules.", icon: UsersRound }
];

type Personalization = {
  accent: "indigo" | "emerald" | "amber";
  density: "comfortable" | "compact";
  defaultInput: "upload" | "text";
  rewriteTone: "plain" | "formal" | "friendly";
};

const defaultPersonalization: Personalization = {
  accent: "indigo",
  density: "comfortable",
  defaultInput: "upload",
  rewriteTone: "plain"
};

function loadPersonalization(): Personalization {
  if (typeof window === "undefined") return defaultPersonalization;
  try {
    return { ...defaultPersonalization, ...JSON.parse(window.localStorage.getItem("complylens-personalization") ?? "{}") };
  } catch {
    return defaultPersonalization;
  }
}

export function SettingsPage() {
  const { profile } = useAuth();
  const role = profile?.role ?? "employee";
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const [personalization, setPersonalization] = useState<Personalization>(() => loadPersonalization());
  const [apiKey, setApiKey] = useState("cl_demo_not_generated");
  const [webhookUrl, setWebhookUrl] = useState("https://company.com/api/complylens/webhook");
  const [extensionSteps, setExtensionSteps] = useState(["build", "load"]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [inviteEmail, setInviteEmail] = useState("employee@company.com");

  useEffect(() => {
    if (role === "admin") {
      void refreshEmployees();
    }
  }, [role]);

  async function refreshEmployees() {
    try {
      setEmployees(await listEmployees());
    } catch {
      setEmployees([]);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await saveCompanySettings({
        organizationId: profile?.workspaceId ?? "demo-org",
        organizationName: String(form.get("organizationName") ?? "Demo Enterprise"),
        threshold: Number(form.get("threshold") ?? 0.62),
        activePolicySet: String(form.get("activePolicySet") ?? "seeded-enterprise-policy")
      });
      setNotice({ kind: "success", text: "Workspace settings saved." });
    } catch (error) {
      setNotice({
        kind: "error",
        text: `Could not save settings. ${error instanceof Error ? error.message.slice(0, 140) : ""}`
      });
    } finally {
      setSaving(false);
    }
  }

  function updatePersonalization(next: Partial<Personalization>) {
    const updated = { ...personalization, ...next };
    setPersonalization(updated);
    window.localStorage.setItem("complylens-personalization", JSON.stringify(updated));
    setNotice({ kind: "success", text: "Workspace personalization updated." });
  }

  function generateApiKey() {
    const token = `cl_demo_${Math.random().toString(36).slice(2, 8)}_${Math.random().toString(36).slice(2, 14)}`;
    setApiKey(token);
    setNotice({ kind: "success", text: "Demo API key generated. Store real production keys in a secure backend vault." });
  }

  async function submitInvite() {
    try {
      const employee = await inviteEmployee({ email: inviteEmail, name: inviteEmail.split("@")[0] || "New employee", department: "Sales", role: "employee" });
      setEmployees((items) => [employee, ...items]);
      setNotice({ kind: "success", text: `Invite created for ${employee.email}.` });
    } catch (error) {
      setNotice({ kind: "error", text: `Could not invite employee. ${error instanceof Error ? error.message.slice(0, 120) : ""}` });
    }
  }

  async function changeEmployeeStatus(employee: Employee, status: Employee["status"]) {
    try {
      const updated = await updateEmployeeStatus(employee.id, status);
      setEmployees((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch {
      setEmployees((items) => items.map((item) => item.id === employee.id ? { ...item, status } : item));
    }
  }

  function toggleExtensionStep(step: string) {
    setExtensionSteps((steps) => steps.includes(step) ? steps.filter((item) => item !== step) : [...steps, step]);
  }

  const profileForm = (
    <form className="settings-form" onSubmit={save}>
      <PanelTitle label={role === "admin" ? "Organization" : "Profile"} title={role === "admin" ? "Company profile" : "Employee account"} />
      <label>
        {role === "admin" ? "Organization name" : "Name"}
        <input defaultValue={profile?.workspaceName ?? (role === "admin" ? "Workspace" : "Employee User")} name="organizationName" />
      </label>
      <label>
        Work email
        <input defaultValue={profile?.email ?? "employee@company.com"} name="email" />
      </label>
      {role === "admin" && (
        <>
          <label>
            Active policy set
            <input defaultValue="seeded-enterprise-policy" name="activePolicySet" />
          </label>
          <label>
            Confidence threshold
            <input defaultValue="0.62" max="0.95" min="0.2" name="threshold" step="0.01" type="number" />
          </label>
        </>
      )}
      <button className="primary-action" disabled={saving} type="submit">
        {saving ? "Saving..." : "Save"}
      </button>
    </form>
  );

  const personalizationPanel = (
    <section className="settings-form personalization-card">
      <PanelTitle label="Personalization" title="Workspace preferences" />
      <div className="preference-group">
        <span><Palette size={16} /> Accent color</span>
        <div className="preference-options">
          {(["indigo", "emerald", "amber"] as const).map((accent) => (
            <button className={personalization.accent === accent ? "active" : ""} key={accent} onClick={() => updatePersonalization({ accent })} type="button">
              <i className={`accent-dot accent-${accent}`} />
              {accent}
            </button>
          ))}
        </div>
      </div>
      <div className="preference-group">
        <span><SlidersHorizontal size={16} /> Layout density</span>
        <div className="preference-options">
          {(["comfortable", "compact"] as const).map((density) => (
            <button className={personalization.density === density ? "active" : ""} key={density} onClick={() => updatePersonalization({ density })} type="button">
              {density}
            </button>
          ))}
        </div>
      </div>
      <div className="preference-grid">
        <label>
          Default work input
          <select value={personalization.defaultInput} onChange={(event) => updatePersonalization({ defaultInput: event.target.value as Personalization["defaultInput"] })}>
            <option value="upload">Upload first</option>
            <option value="text">Text first</option>
          </select>
        </label>
        <label>
          Rewrite tone
          <select value={personalization.rewriteTone} onChange={(event) => updatePersonalization({ rewriteTone: event.target.value as Personalization["rewriteTone"] })}>
            <option value="plain">Plain and simple</option>
            <option value="formal">Formal legal</option>
            <option value="friendly">Friendly workplace</option>
          </select>
        </label>
      </div>
    </section>
  );

  return (
    <WorkspaceShell role={role}>
      <section className="page-panel settings-page">
        <div className="workspace-command-bar compact-command-bar">
          <div>
            <h1>{role === "admin" ? "Admin & Profile" : "Settings & Profile"}</h1>
            <p>{role === "admin" ? "Manage people, policies, extension setup, company profile, and simple risk reports." : "Manage your employee profile and review how compliance checks work."}</p>
          </div>
          <div className="workspace-command-status">
            <span><Gauge size={15} /> Threshold 0.62</span>
            <span><ShieldCheck size={15} /> Human review active</span>
          </div>
        </div>
        {notice && <NoticeBox notice={notice} onClose={() => setNotice(null)} />}

        {role === "employee" ? (
          <div className="employee-settings-layout">
            <div className="employee-settings-top">
              {profileForm}
              {personalizationPanel}
            </div>
            <aside className="settings-side employee-settings-cards">
              {employeePreferences.map(({ title, copy, icon: Icon }) => (
                <article key={title}>
                  <Icon size={18} />
                  <div>
                    <strong>{title}</strong>
                    <span>{copy}</span>
                  </div>
                </article>
              ))}
            </aside>
          </div>
        ) : (
          <div className="settings-grid settings-grid--wide">
            <div className="profile-settings-stack">
              {profileForm}
              {personalizationPanel}
            </div>
          {role === "admin" ? (
            <div className="admin-control-stack">
              <section className="ops-card">
                <PanelTitle label="Team access" title="Assign employee login" />
                <div className="employee-invite-row">
                  <UserPlus size={18} />
                  <div>
                    <strong>Invite employee</strong>
                    <input aria-label="Employee invite email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
                  </div>
                  <button onClick={() => void submitInvite()} type="button">Send</button>
                </div>
                <div className="employee-table">
                  {employees.map((employee) => (
                    <article key={employee.id}>
                      <div>
                        <strong>{employee.name}</strong>
                        <span>{employee.email}</span>
                      </div>
                      <span>{employee.department}</span>
                      <select value={employee.status} onChange={(event) => void changeEmployeeStatus(employee, event.target.value as Employee["status"])}>
                        <option value="invited">Invited</option>
                        <option value="active">Active</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </article>
                  ))}
                </div>
              </section>

              <section className="ops-card">
                <PanelTitle label="Simple reports" title="Admin risk view" />
                <div className="admin-report-grid">
                  {adminReports.map((report) => (
                    <div key={report.label}>
                      <BarChart3 size={17} />
                      <span>{report.label}</span>
                      <strong>{report.value}</strong>
                      <small>{report.note}</small>
                    </div>
                  ))}
                </div>
              </section>

              <section className="ops-card">
                <PanelTitle label="Integrations" title="API and extension setup" />
                <div className="admin-integration-panel">
                  <div className="api-key-box">
                    <KeyRound size={18} />
                    <div>
                      <strong>API key</strong>
                      <code>{apiKey}</code>
                    </div>
                    <button onClick={generateApiKey} type="button">
                      <RefreshCw size={14} />
                      Generate
                    </button>
                  </div>
                  <label className="webhook-field">
                    Webhook endpoint
                    <input value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} />
                  </label>
                  <div className="extension-checklist">
                    {[
                      ["build", "Run npm run build:extension"],
                      ["load", "Load apps/extension/dist in Chrome"],
                      ["api", "Set backend URL to http://127.0.0.1:8000"],
                      ["assign", "Assign employees after install"]
                    ].map(([id, label]) => (
                      <button className={extensionSteps.includes(id) ? "done" : ""} key={id} onClick={() => toggleExtensionStep(id)} type="button">
                        <CheckCircle2 size={15} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="integration-setup-card">
                  <Puzzle size={18} />
                  <div>
                    <strong>Production integration path</strong>
                    <span>Point web, extension, and webhook clients to the same backend analysis endpoints so policy logic stays centralized.</span>
                  </div>
                </div>
              </section>
            </div>
          ) : null}
          </div>
        )}
      </section>
    </WorkspaceShell>
  );
}
