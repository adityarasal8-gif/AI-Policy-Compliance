import { useEffect, useMemo, useState } from "react";
import { Activity, Bot, CheckCircle2, Download, FileText, GitBranch, MailCheck, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { PanelTitle } from "../components/common/PanelTitle";
import { WorkspaceShell } from "../layouts/WorkspaceShell";
import { listAuditEvents, listSavedSessions, markAuditEventReviewed } from "../api/complianceApi";
import { maskSensitiveText, redactDocumentName } from "../lib/privacy";
import type { AuditEvent, SavedSession } from "@complylens/shared";

type AuditEventRow = AuditEvent & { tone?: string };
const departments = ["All", "Legal", "Sales", "HR", "Security", "Finance"];

export function ActivityPage() {
  const { profile } = useAuth();
  const role = profile?.role ?? "employee";
  const [filter, setFilter] = useState<"all" | "open" | "reviewed">("all");
  const [department, setDepartment] = useState("All");
  const [auditEvents, setAuditEvents] = useState<AuditEventRow[]>([]);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);

  useEffect(() => {
    if (role === "admin") void refreshAuditEvents();
    if (role === "employee") void refreshSavedSessions();
  }, [role, department]);

  async function refreshAuditEvents() {
    try {
      const events = await listAuditEvents(department);
      setAuditEvents(events);
    } catch {
      setAuditEvents([]);
    }
  }

  async function refreshSavedSessions() {
    try {
      const sessions = await listSavedSessions(department);
      setSavedSessions(sessions);
    } catch {
      setSavedSessions([]);
    }
  }

  const visibleAuditEvents = useMemo(
    () => auditEvents.filter((event) => filter === "all" || event.status === filter),
    [auditEvents, filter]
  );

  async function markReviewed(id: string) {
    try {
      const updated = await markAuditEventReviewed(id);
      setAuditEvents((events) => events.map((event) => event.id === id ? updated : event));
    } catch {
      // Intentionally swallow error or show notice (removed offline fallback)
    }
  }

  function exportAudit() {
    const csv = [
      "title,detail,owner,status,time",
      ...visibleAuditEvents.map((event) => `"${maskSensitiveText(event.title)}","${maskSensitiveText(event.detail)}","${maskSensitiveText(event.owner)}","${event.status}","${event.time}"`)
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "complylens-audit-trail.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <WorkspaceShell role={role}>
      <section className="ops-dashboard simple-dashboard">
        <div className="workspace-command-bar compact-command-bar">
          <div>
            <h1>{role === "admin" ? "Audit Trail" : "Session History"}</h1>
            <p>{role === "admin" ? "Filter, review, and export scans, rewrites, uploads, policy retrieval, and extension events." : "See your previous compliance checks and what happened in each one."}</p>
          </div>
          <div className="workspace-command-status">
            <span><GitBranch size={15} /> {role === "admin" ? `${visibleAuditEvents.length} events shown` : `${savedSessions.length} saved checks`}</span>
            <span><MailCheck size={15} /> Gmail ready</span>
          </div>
        </div>

        {role === "employee" ? (
          <div className="intelligence-grid intelligence-grid--balanced">
            <section className="ops-card wide">
              <PanelTitle label="Your checks" title="Recent compliance history" />
              <div className="activity-feed">
                {savedSessions.length ? savedSessions.map((session) => (
                  <article className="activity-item tone-good" key={session.id}>
                    <FileText size={16} />
                    <div>
                      <strong>{redactDocumentName(session.documentName)}</strong>
                      <span>{session.department} · {session.team} · score {session.score}</span>
                    </div>
                    <time>{new Date(session.createdAt).toLocaleDateString()}</time>
                  </article>
                )) : (
                  <article className="activity-item tone-good">
                    <FileText size={16} />
                    <div>
                      <strong>No saved checks yet</strong>
                      <span>Run a real analysis from Gmail or the workspace and it will appear here.</span>
                    </div>
                  </article>
                )}
              </div>
            </section>
            <section className="ops-card">
              <PanelTitle label="Status" title="Simple summary" />
              <div className="insight-list">
                <div><CheckCircle2 size={16} /> {savedSessions.length} saved check{savedSessions.length === 1 ? "" : "s"}</div>
                <div><ShieldCheck size={16} /> {savedSessions.reduce((total, session) => total + session.report.violations.length, 0)} flagged items total</div>
                <div><Activity size={16} /> Live backend history only</div>
              </div>
            </section>
          </div>
        ) : (
          <div className="audit-workspace">
            <section className="ops-card audit-control-card">
              <PanelTitle label="Audit controls" title="Working review queue" />
              <div className="audit-filter-row">
                {(["all", "open", "reviewed"] as const).map((item) => (
                  <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)} type="button">
                    {item}
                  </button>
                ))}
              </div>
              <label className="audit-department-filter">
                Department
                <select value={department} onChange={(event) => setDepartment(event.target.value)}>
                  {departments.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <button className="secondary-action-button audit-export-button" onClick={exportAudit} type="button">
                <Download size={15} />
                Export CSV
              </button>
              <div className="insight-list">
                <div><Bot size={16} />{visibleAuditEvents.length} backend audit events loaded</div>
                <div><ShieldCheck size={16} />{visibleAuditEvents.filter((event) => event.status === "open").length} open items awaiting review</div>
              </div>
            </section>

            <section className="ops-card wide">
              <PanelTitle label="Compliance log" title="Operational history" />
              <div className="activity-feed audit-feed">
                {visibleAuditEvents.length ? visibleAuditEvents.map((activity) => (
                  <article className={`activity-item tone-${activity.tone}`} key={activity.id}>
                    <Activity size={16} />
                    <div>
                      <strong>{activity.title}</strong>
                      <span>{activity.detail}</span>
                      <small>{activity.owner} · {activity.status}</small>
                    </div>
                    <div className="audit-actions">
                      <time>{activity.time}</time>
                      {activity.status === "open" && (
                        <button onClick={() => void markReviewed(activity.id)} type="button">
                          Mark reviewed
                        </button>
                      )}
                    </div>
                  </article>
                )) : (
                  <article className="activity-item tone-good">
                    <Activity size={16} />
                    <div>
                      <strong>No audit events yet</strong>
                      <span>Once admins upload policies, toggle rules, or users run checks, the backend audit log will appear here.</span>
                    </div>
                  </article>
                )}
              </div>
            </section>
          </div>
        )}
      </section>
    </WorkspaceShell>
  );
}
