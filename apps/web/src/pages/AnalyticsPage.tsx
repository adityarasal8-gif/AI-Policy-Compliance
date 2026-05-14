import { useEffect, useMemo, useState } from "react";
import { BarChart3, CheckCircle2, FileText, MessageSquareWarning, RefreshCw, ShieldCheck, TrendingDown, UserCheck } from "lucide-react";
import type { ReportSummary } from "@complylens/shared";
import { PanelTitle } from "../components/common/PanelTitle";
import { getReportSummary } from "../api/complianceApi";
import { WorkspaceShell } from "../layouts/WorkspaceShell";

const departments = ["All", "Legal", "Sales", "HR", "Security", "Finance"];

const fallbackSummary: ReportSummary = {
  role: "admin",
  generatedAt: new Date().toISOString(),
  metrics: [
    { label: "Checks", value: 0, suffix: "", delta: "waiting for saved sessions", tone: "neutral" },
    { label: "Risk prevented", value: 0, suffix: "", delta: "flagged sections", tone: "warning" },
    { label: "Average score", value: 100, suffix: "%", delta: "no risky files yet", tone: "success" },
    { label: "Open audit events", value: 0, suffix: "", delta: "needs review", tone: "neutral" }
  ],
  departmentRisk: [],
  policyViolations: [],
  trend: [0],
  recentSessions: [],
  auditEvents: []
};

function ReportsView({ role }: { role: "admin" | "employee" }) {
  const [department, setDepartment] = useState("All");
  const [summary, setSummary] = useState<ReportSummary>(fallbackSummary);
  const [loading, setLoading] = useState(true);
  const isAdmin = role === "admin";

  useEffect(() => {
    let active = true;
    setLoading(true);
    getReportSummary(role, department)
      .then((data) => {
        if (active) setSummary(data);
      })
      .catch(() => {
        if (active) setSummary({ ...fallbackSummary, role });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [department, role]);

  const maxTrend = useMemo(() => Math.max(...summary.trend, 1), [summary.trend]);

  return (
    <WorkspaceShell role={role}>
      <section className="ops-dashboard simple-dashboard">
        <div className="workspace-command-bar">
          <div>
            <h1>{isAdmin ? "Risk Intelligence" : "My Reports"}</h1>
            <p>{isAdmin ? "Live organization reports from saved sessions, audit events, and policy findings." : "Your saved checks, safe rewrite progress, and documents that need attention."}</p>
          </div>
          <div className="workspace-command-status">
            <span>{isAdmin ? <TrendingDown size={15} /> : <UserCheck size={15} />} {isAdmin ? "Admin report" : "Personal report"}</span>
            <span><RefreshCw size={15} /> {loading ? "Syncing" : "Backend data"}</span>
          </div>
        </div>

        {isAdmin && (
          <div className="audit-filter-row">
            <BarChart3 size={16} />
            <span>Department</span>
            <select value={department} onChange={(event) => setDepartment(event.target.value)}>
              {departments.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
        )}

        <div className="metric-grid">
          {summary.metrics.map((metric) => (
            <article className={`metric-card tone-${metric.tone}`} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}<small>{metric.suffix}</small></strong>
              <em>{metric.delta}</em>
            </article>
          ))}
        </div>

        <div className="intelligence-grid">
          <section className="ops-card">
            <PanelTitle label={isAdmin ? "Risk concentration" : "Personal risk"} title={isAdmin ? "Departments with the most findings" : "Recent files checked"} />
            <div className="heatmap-list">
              {(isAdmin ? summary.departmentRisk : summary.recentSessions.map((session) => ({ id: session.id, label: session.documentName, value: Math.max(session.flaggedSections * 25, 8), tone: session.flaggedSections ? "warning" : "success" as const }))).map((item, index) => (
                <div className={`heatmap-row tone-${item.tone}`} key={"id" in item ? item.id : `${item.label}-${index}`}>
                  <span>{item.label}</span>
                  <div><i style={{ width: `${Math.max(item.value, 4)}%` }} /></div>
                  <strong>{item.value}%</strong>
                </div>
              ))}
              {!summary.departmentRisk.length && isAdmin && <div className="empty-mini">Run analyses to populate department risk.</div>}
            </div>
          </section>

          <section className="ops-card">
            <PanelTitle label="Timeline" title={isAdmin ? "Risk prevented over time" : "My weekly finding trend"} />
            <div className="trend-chart">
              {summary.trend.map((point, index) => <i key={`${point}-${index}`} style={{ height: `${Math.max((point / maxTrend) * 100, 8)}%` }} />)}
            </div>
          </section>

          <section className="ops-card">
            <PanelTitle label="Policies" title={isAdmin ? "Most violated rules" : "Rules I should watch"} />
            <div className="heatmap-list">
              {summary.policyViolations.map((item, index) => (
                <div className={`heatmap-row tone-${item.tone}`} key={`${item.label}-${index}`}>
                  <span>{item.label}</span>
                  <div><i style={{ width: `${Math.max(item.value, 4)}%` }} /></div>
                  <strong>{item.value}%</strong>
                </div>
              ))}
              {!summary.policyViolations.length && <div className="empty-mini">No repeated policy risks yet.</div>}
            </div>
          </section>

          <section className="ops-card team-policy-card">
            <PanelTitle label={isAdmin ? "Audit evidence" : "Session evidence"} title={isAdmin ? "Latest operational events" : "Recent compliance checks"} />
            <div className="team-table">
              {(isAdmin ? summary.auditEvents : summary.recentSessions).slice(0, 5).map((item) => (
                "eventType" in item ? (
                  <div key={item.id}>
                    <span>{item.title}</span>
                    <strong>{item.status}</strong>
                    <small>{item.department} · {item.eventType}</small>
                  </div>
                ) : (
                  <div key={item.id}>
                    <span>{item.documentName}</span>
                    <strong>{item.score}%</strong>
                    <small>{item.flaggedSections} findings · {item.department}</small>
                  </div>
                )
              ))}
            </div>
          </section>

          <section className="ops-card">
            <PanelTitle label="Recommended action" title={isAdmin ? "What admins should do next" : "What to do before sending"} />
            <div className="insight-list">
              <div><MessageSquareWarning size={16} /> {isAdmin ? "Review open audit events and repeated policy violations weekly." : "Run checks on customer, HR, legal, and vendor drafts before sharing."}</div>
              <div><ShieldCheck size={16} /> {isAdmin ? "Disable outdated policy chunks and upload the latest policy version." : "Use safe rewrites when sensitive data or guarantee language appears."}</div>
              <div><FileText size={16} /> {isAdmin ? "Export important analyses as evidence for compliance review." : "Keep report exports for manager-reviewed communications."}</div>
              <div><CheckCircle2 size={16} /> {isAdmin ? "Use employee invite links to onboard teams into the same workflow." : "Clean drafts do not need extra admin review."}</div>
            </div>
          </section>
        </div>
      </section>
    </WorkspaceShell>
  );
}

export function AnalyticsPage() {
  const role = typeof window !== "undefined" && window.localStorage.getItem("complylens-role") === "admin" ? "admin" : "employee";
  return <ReportsView role={role} />;
}
