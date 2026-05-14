import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardCheck, FileText, MessageSquareWarning, RefreshCw, ShieldCheck, Target, TrendingDown, UserCheck } from "lucide-react";
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

        <div className="metric-grid report-metric-grid">
          {summary.metrics.map((metric) => (
            <article className={`metric-card tone-${metric.tone}`} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.suffix === "$" ? "$" : ""}{metric.value.toLocaleString()}<small>{metric.suffix === "$" ? "" : metric.suffix}</small></strong>
              <em>{metric.delta}</em>
            </article>
          ))}
        </div>

        <div className="report-hero-grid">
          <section className="ops-card report-command-card">
            <PanelTitle label={isAdmin ? "Executive signal" : "Today’s send decision"} title={isAdmin ? "What changed the business outcome" : "What you should do next"} />
            <div className="report-insight-grid">
              {summary.executiveInsights.slice(0, isAdmin ? 6 : 5).map((insight, index) => (
                <article className={`report-insight tone-${insight.tone}`} key={`${insight.title}-${index}`}>
                  <strong>{insight.value}</strong>
                  <span>{insight.title}</span>
                  <p>{insight.detail}</p>
                </article>
              ))}
              {!summary.executiveInsights.length && <div className="empty-mini">Run more scans to build an evidence-backed report.</div>}
            </div>
          </section>

          <section className="ops-card report-action-card">
            <PanelTitle label={isAdmin ? "Action plan" : "Fix list"} title={isAdmin ? "Highest priority admin work" : "Do this before sending"} />
            <div className="report-action-list">
              {summary.actionPlan.map((item, index) => (
                <article className={`report-action priority-${item.priority}`} key={`${item.label}-${item.owner}-${index}`}>
                  <span>{item.priority}</span>
                  <strong>{item.label}</strong>
                  <small>{item.owner}</small>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          </section>
        </div>

        <div className="report-ops-grid">
          <section className="ops-card">
            <PanelTitle label={isAdmin ? "Risk map" : "Draft status"} title={isAdmin ? "Top departments with recommended focus" : "Ready, rewrite, or manager review"} />
            <div className="report-status-list">
              {(isAdmin ? summary.departmentRisk : summary.recentSessions.map((session) => ({ id: session.id, label: session.documentName, value: Math.max(session.flaggedSections * 25, 8), tone: session.status === "blocked" ? "danger" as const : session.flaggedSections ? "warning" as const : "success" as const, status: session.status === "blocked" ? "Manager review" : session.flaggedSections ? "Needs rewrite" : "Clean" }))).map((item, index) => (
                <article className={`report-status-row tone-${item.tone}`} key={"id" in item ? String(item.id) : `${item.label}-${index}`}>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{"status" in item ? String(item.status) : item.tone === "danger" ? "Immediate coaching" : "Watch list"}</small>
                  </div>
                  <div className="mini-risk-meter"><i style={{ width: `${Math.max(item.value, 4)}%` }} /></div>
                  <span>{item.value}%</span>
                </article>
              ))}
              {!summary.departmentRisk.length && isAdmin && <div className="empty-mini">Run scans to see which department needs policy coaching first.</div>}
            </div>
          </section>

          <section className="ops-card">
            <PanelTitle label={isAdmin ? "Policy drift" : "Risky phrase coaching"} title={isAdmin ? "Rules causing rewrites and old-version risk" : "Language to avoid next time"} />
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

          <section className="ops-card">
            <PanelTitle label={isAdmin ? "Risk prevented" : "Improvement"} title={isAdmin ? "Blocked risk by scan date" : "Plain-language progress"} />
            <div className="trend-chart report-outcome-chart">
              {summary.trend.map((point, index) => <i key={`${point}-${index}`} style={{ height: `${Math.max((point / maxTrend) * 100, 8)}%` }} />)}
            </div>
            <div className="report-value-note">
              {isAdmin ? "This is not traffic. It is risk caught before delivery, useful for judge demos and compliance ROI." : "Use this as a simple progress signal: fewer tall bars means fewer risky phrases in your drafts."}
            </div>
          </section>
        </div>

        <div className="report-evidence-grid">
          <section className="ops-card team-policy-card">
            <PanelTitle label={isAdmin ? "Audit-ready exports" : "Proof for managers"} title={isAdmin ? "Evidence packets worth exporting" : "Recent checks with simple badges"} />
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
            <PanelTitle label={isAdmin ? "Operational evidence" : "Useful next habits"} title={isAdmin ? "Latest scans, invites, and policy actions" : "What to fix next"} />
            <div className="insight-list">
              <div><Target size={16} /> {isAdmin ? "Use the action plan as the admin work queue for the next compliance cycle." : "Open the first Needs rewrite draft and apply the safe rewrite before sending."}</div>
              <div><MessageSquareWarning size={16} /> {isAdmin ? "Treat repeat offender teams as training targets, not just analytics rows." : "Avoid guarantees, private customer data, HR details, and legal claims unless approved."}</div>
              <div><ShieldCheck size={16} /> {isAdmin ? "Export audit packets before judge demos or legal reviews." : "Clean drafts can be sent without opening a manager review ticket."}</div>
              <div><FileText size={16} /> {isAdmin ? "Policy drift should trigger a policy upload, compare, and enable/disable decision." : "Export a report only when a manager needs proof."}</div>
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
