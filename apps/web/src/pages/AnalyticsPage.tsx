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
    { label: "Messages checked", value: 0, suffix: "", delta: "waiting for saved scans", tone: "neutral" },
    { label: "Issues caught", value: 0, suffix: "", delta: "before sending", tone: "warning" },
    { label: "Compliance quality", value: 100, suffix: "%", delta: "no risky files yet", tone: "success" },
    { label: "Review queue", value: 0, suffix: "", delta: "admin decisions open", tone: "neutral" }
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
            <h1>{isAdmin ? "Compliance Control Report" : "My Safe-Send Report"}</h1>
            <p>{isAdmin ? "See where risky communication is coming from, what needs review, and which policies are creating the most work." : "See which drafts are ready, which need a rewrite, and what language to avoid next time."}</p>
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
            <PanelTitle label={isAdmin ? "Where to focus" : "My checked work"} title={isAdmin ? "Departments creating review workload" : "Recent drafts and their risk level"} />
            <div className="heatmap-list">
              {(isAdmin ? summary.departmentRisk : summary.recentSessions.map((session) => ({ id: session.id, label: session.documentName, value: Math.max(session.flaggedSections * 25, 8), tone: session.flaggedSections ? "warning" : "success" as const }))).map((item, index) => (
                <div className={`heatmap-row tone-${item.tone}`} key={"id" in item ? item.id : `${item.label}-${index}`}>
                  <span>{item.label}</span>
                  <div><i style={{ width: `${Math.max(item.value, 4)}%` }} /></div>
                  <strong>{item.value}%</strong>
                </div>
              ))}
              {!summary.departmentRisk.length && isAdmin && <div className="empty-mini">Run scans to see which department needs policy coaching first.</div>}
            </div>
          </section>

          <section className="ops-card">
            <PanelTitle label={isAdmin ? "Business outcome" : "Send readiness"} title={isAdmin ? "Risk caught before delivery" : "Drafts that still need fixes"} />
            <div className="trend-chart">
              {summary.trend.map((point, index) => <i key={`${point}-${index}`} style={{ height: `${Math.max((point / maxTrend) * 100, 8)}%` }} />)}
            </div>
            <div className="report-value-note">
              {isAdmin ? "Use this to prove how many risky sections were stopped before employees sent them." : "Each bar is a check where ComplyLens found language you should fix before sending."}
            </div>
          </section>

          <section className="ops-card">
            <PanelTitle label="Policy coaching" title={isAdmin ? "Rules causing the most rewrites" : "Rules I keep triggering"} />
            <div className="heatmap-list">
              {summary.policyViolations.map((item, index) => (
                <div className={`heatmap-row tone-${item.tone}`} key={`${item.label}-${index}`}>
                  <span>{item.label}</span>
                  <div><i style={{ width: `${Math.max(item.value, 4)}%` }} /></div>
                  <strong>{item.value}%</strong>
                </div>
              ))}
              {!summary.policyViolations.length && <div className="empty-mini">No repeated policy risks yet. New findings will appear here after scans.</div>}
            </div>
          </section>

          <section className="ops-card team-policy-card">
            <PanelTitle label={isAdmin ? "Evidence trail" : "My evidence"} title={isAdmin ? "Latest scans, invites, and policy actions" : "Recent checks I can export or revisit"} />
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
            <PanelTitle label="Decision help" title={isAdmin ? "What to fix operationally" : "What to do before sending"} />
            <div className="insight-list">
              <div><MessageSquareWarning size={16} /> {isAdmin ? "Coach the department with the highest review workload first." : "Rewrite any sentence that includes promises, private data, or HR-sensitive details."}</div>
              <div><ShieldCheck size={16} /> {isAdmin ? "Update the policies that repeatedly trigger findings and compare versions before enabling them." : "Use the suggested rewrite, then run analysis again until the draft is ready."}</div>
              <div><FileText size={16} /> {isAdmin ? "Export high-risk scans as review evidence for legal or compliance signoff." : "Export the report when a manager needs proof that the draft was checked."}</div>
              <div><CheckCircle2 size={16} /> {isAdmin ? "Invite employees into the workflow instead of handling reviews manually." : "Clean drafts can be sent without opening an admin review ticket."}</div>
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
