import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardCheck, MessageSquareWarning, RefreshCw, TrendingDown, UserCheck } from "lucide-react";
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
  auditEvents: [],
  executiveInsights: [],
  actionPlan: [],
  evidenceExports: []
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
  const metricByLabel = (label: string) => summary.metrics.find((metric) => metric.label === label);
  const insightByTitle = (title: string) => summary.executiveInsights.find((insight) => insight.title === title);
  const readiness = metricByLabel("Ready to send");
  const rewriteWork = metricByLabel("Fixes needed");
  const safety = metricByLabel("Writing safety");
  const topDepartment = insightByTitle("Top risky department");
  const reviewerSla = insightByTitle("Reviewer SLA");
  const repeatPattern = insightByTitle("Repeated risky phrase");
  const improvement = insightByTitle("Plain-language improvement");
  const savedByAi = insightByTitle("Financial risk prevented") ?? insightByTitle("Ready to send");
  const visibleMetrics = isAdmin ? summary.metrics.filter((metric) => metric.label !== "Risk value protected") : summary.metrics;
  const statusRows = isAdmin
    ? summary.departmentRisk.map((item) => ({ id: item.label, label: item.label, value: item.value, tone: item.tone, status: item.tone === "danger" ? "Coaching required" : "Monitor" }))
    : summary.recentSessions.map((session) => ({
        id: session.id,
        label: session.documentName,
        value: Math.max(session.flaggedSections * 25, 8),
        tone: session.status === "blocked" ? "danger" as const : session.flaggedSections ? "warning" as const : "success" as const,
        status: session.status === "blocked" ? "Manager review" : session.flaggedSections ? "Needs rewrite" : "Clean"
      }));

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
          <div className="audit-filter-row report-filter-row">
            <BarChart3 size={16} />
            <span>Department</span>
            <select value={department} onChange={(event) => setDepartment(event.target.value)}>
              {departments.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
        )}

        {!isAdmin && (
          <section className="report-decision-banner employee">
            <div>
              <span>Before you send</span>
              <h2>{readiness?.value ?? 0}{readiness?.suffix ?? "%"} ready-to-send rate</h2>
              <p>{rewriteWork?.value ?? 0} rewrite items need attention. {safety?.value ?? 0}% average writing safety across recent drafts.</p>
            </div>
            <strong>{summary.evidenceExports.filter((item) => item.value === "Clean").length}/{summary.evidenceExports.length || 1}</strong>
            <small>recent drafts clean</small>
          </section>
        )}

        <div className="report-evidence-strip">
          {visibleMetrics.map((metric) => (
            <article className={`report-proof-pill tone-${metric.tone}`} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.suffix === "$" ? "$" : ""}{metric.value.toLocaleString()}{metric.suffix === "$" ? "" : metric.suffix}</strong>
              <small>{metric.delta}</small>
            </article>
          ))}
        </div>

        <div className="report-control-grid">
          <section className="ops-card report-control-primary">
            <PanelTitle label={isAdmin ? "Organization risk exposure" : "Communication readiness"} title={isAdmin ? "Where leadership should act first" : "Ready, rewrite, or manager review"} />
            <div className="report-status-list">
              {statusRows.map((item, index) => (
                <article className={`report-status-row tone-${item.tone}`} key={`${item.id}-${index}`}>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.status}</small>
                  </div>
                  <div className="mini-risk-meter"><i style={{ width: `${Math.max(item.value, 4)}%` }} /></div>
                  <span>{item.value}%</span>
                </article>
              ))}
              {!statusRows.length && <div className="empty-mini">Run scans to build a decision-ready report.</div>}
            </div>
          </section>

          <section className="ops-card report-action-card">
            <PanelTitle label={isAdmin ? "Operational action queue" : "AI writing coaching"} title={isAdmin ? "Prioritized work queue" : "What to fix next"} />
            <div className="report-action-list">
              {summary.actionPlan.map((item, index) => (
                <article className={`report-action priority-${item.priority}`} key={`${item.label}-${item.owner}-${index}`}>
                  <span>{item.priority}</span>
                  <strong>{item.label}</strong>
                  <small>{item.owner}</small>
                  <p>{item.detail}</p>
                </article>
              ))}
              {!summary.actionPlan.length && <div className="empty-mini">No action required yet. Run more checks to create a coaching queue.</div>}
            </div>
          </section>
        </div>

        <div className="report-decision-grid">
          <section className="ops-card">
            <PanelTitle label={isAdmin ? "Policy failure intelligence" : "Repeated risk patterns"} title={isAdmin ? "Policies employees struggle with" : "Patterns detected in your drafts"} />
            <div className="report-brief-list">
              {summary.policyViolations.map((item, index) => (
                <article key={`${item.label}-${index}`}>
                  <MessageSquareWarning size={16} />
                  <div>
                    <strong>{item.label}</strong>
                    <span>{isAdmin ? "Needs training examples and policy clarification." : "Review this policy before sending similar drafts."}</span>
                  </div>
                  <em>{item.value}%</em>
                </article>
              ))}
              {!summary.policyViolations.length && <div className="empty-mini">No repeated policy risks yet.</div>}
            </div>
          </section>

          <section className="ops-card">
            <PanelTitle label={isAdmin ? "Teams needing coaching" : "Saved by AI"} title={isAdmin ? "Repeat offender signal" : "What ComplyLens prevented"} />
            <div className="report-single-insight">
              <strong>{isAdmin ? (topDepartment?.value ?? "No team yet") : (savedByAi?.value ?? "0")}</strong>
              <span>{isAdmin ? (topDepartment?.title ?? "Team coaching") : (savedByAi?.title ?? "Drafts protected")}</span>
              <p>{isAdmin ? (topDepartment?.detail ?? "Department coaching recommendations appear after scans.") : (savedByAi?.detail ?? "Run checks to see what risks were prevented.")}</p>
            </div>
          </section>

          <section className="ops-card">
            <PanelTitle label={isAdmin ? "Reviewer operations" : "Policy understanding"} title={isAdmin ? "SLA and escalation pressure" : "What needs attention"} />
            <div className="report-single-insight">
              <strong>{isAdmin ? (reviewerSla?.value ?? "0 open") : (repeatPattern?.value ?? "No pattern yet")}</strong>
              <span>{isAdmin ? (reviewerSla?.title ?? "Reviewer SLA") : (repeatPattern?.title ?? "Policy understanding score")}</span>
              <p>{isAdmin ? (reviewerSla?.detail ?? "Open reviewer actions appear here.") : (repeatPattern?.detail ?? "Repeated risky phrases will appear after more scans.")}</p>
            </div>
          </section>
        </div>

        <div className="report-evidence-grid">
          <section className="ops-card team-policy-card">
            <PanelTitle label={isAdmin ? "Audit readiness" : "Recent checked drafts"} title={isAdmin ? "Evidence packets worth exporting" : "Simple badges, not analytics noise"} />
            <div className="report-export-list">
              {summary.evidenceExports.map((item, index) => (
                <article className={`report-export-row tone-${item.tone}`} key={`${item.title}-${index}`}>
                  {isAdmin ? <ClipboardCheck size={17} /> : item.value === "Clean" ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </div>
                  <span>{item.value}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="ops-card">
            <PanelTitle label={isAdmin ? "Control timeline" : "Improvement timeline"} title={isAdmin ? "Risk stopped before delivery" : "Plain-language progress"} />
            <div className="trend-chart report-outcome-chart">
              {summary.trend.map((point, index) => <i key={`${point}-${index}`} style={{ height: `${Math.max((point / maxTrend) * 100, 8)}%` }} />)}
            </div>
            <div className="report-value-note">
              {isAdmin ? "Use this only as evidence of risk intercepted. Leadership actions above matter more than the chart." : `${improvement?.detail ?? "Fewer tall bars means fewer risky phrases in your drafts."}`}
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
