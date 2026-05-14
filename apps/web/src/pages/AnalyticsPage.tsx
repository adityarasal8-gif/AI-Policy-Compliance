import { BarChart3, CheckCircle2, Download, FileText, MessageSquareWarning, ShieldCheck, TrendingDown, UserCheck } from "lucide-react";
import { PanelTitle } from "../components/common/PanelTitle";
import { dashboardMetrics, policyViolationShare, riskHeatmap, teamAnalytics, trendPoints } from "../data/productData";
import { WorkspaceShell } from "../layouts/WorkspaceShell";

const employeeMetrics = [
  { label: "My checks", value: "14", suffix: "", delta: "4 this week", tone: "success" },
  { label: "Safe rewrites used", value: "9", suffix: "", delta: "3 accepted today", tone: "success" },
  { label: "Risk avoided", value: "6", suffix: "", delta: "before sending", tone: "warning" },
  { label: "Clean drafts", value: "57", suffix: "%", delta: "no admin review", tone: "success" }
];

const employeeHistory = [
  ["Vendor NDA", 2, "Reviewed"],
  ["Sales outreach", 1, "Rewrite used"],
  ["HR note", 0, "Clean"],
  ["Customer email", 3, "Needs caution"]
] as const;

function EmployeeReports() {
  return (
    <WorkspaceShell role="employee">
      <section className="ops-dashboard simple-dashboard">
        <div className="workspace-command-bar">
          <div>
            <h1>My Reports</h1>
            <p>Personal compliance progress, rewrite usage, and drafts that may need attention before sending.</p>
          </div>
          <div className="workspace-command-status">
            <span><UserCheck size={15} /> Personal view</span>
            <span><CheckCircle2 size={15} /> 9 rewrites used</span>
          </div>
        </div>

        <div className="metric-grid">
          {employeeMetrics.map((metric) => (
            <article className={`metric-card tone-${metric.tone}`} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}<small>{metric.suffix}</small></strong>
              <em>{metric.delta}</em>
            </article>
          ))}
        </div>

        <div className="intelligence-grid intelligence-grid--balanced">
          <section className="ops-card wide">
            <PanelTitle label="Personal history" title="Recent checks by document" />
            <div className="team-table">
              {employeeHistory.map(([name, risks, state]) => (
                <div key={name}>
                  <span>{name}</span>
                  <strong>{risks}</strong>
                  <small>{state} · {risks ? `${risks} risky sections` : "no risky sections"}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="ops-card">
            <PanelTitle label="Helpful habits" title="What to improve" />
            <div className="insight-list">
              <div><FileText size={16} /> Run checks before sending vendor or customer drafts.</div>
              <div><ShieldCheck size={16} /> Use suggested rewrites when guarantee or customer data language appears.</div>
              <div><Download size={16} /> Export reports for documents that need manager review.</div>
            </div>
          </section>
        </div>
      </section>
    </WorkspaceShell>
  );
}

function AdminReports() {
  return (
    <WorkspaceShell role="admin">
      <section className="ops-dashboard simple-dashboard">
        <div className="workspace-command-bar">
          <div>
            <h1>Risk Intelligence</h1>
            <p>Organization-level signals for blocked risk, rewrite adoption, reviewer agreement, and policy drift.</p>
          </div>
          <div className="workspace-command-status">
            <span><TrendingDown size={15} /> Risk down 22%</span>
            <span><CheckCircle2 size={15} /> 81% rewrites accepted</span>
          </div>
        </div>

        <div className="metric-grid">
          {dashboardMetrics.map((metric) => (
            <article className={`metric-card tone-${metric.tone}`} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}<small>{metric.suffix}</small></strong>
              <em>{metric.delta}</em>
            </article>
          ))}
        </div>

        <div className="intelligence-grid">
          <section className="ops-card">
            <PanelTitle label="Risk concentration" title="Departments with spikes" />
            <div className="heatmap-list">
              {riskHeatmap.map(([label, value, tone]) => (
                <div className={`heatmap-row tone-${tone}`} key={label}>
                  <span>{label}</span>
                  <div><i style={{ width: `${value}%` }} /></div>
                  <strong>{value}%</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="ops-card">
            <PanelTitle label="Compliance timeline" title="Weekly risk prevented" />
            <div className="trend-chart">
              {trendPoints.map((point, index) => <i key={`${point}-${index}`} style={{ height: `${point}%` }} />)}
            </div>
          </section>

          <section className="ops-card">
            <PanelTitle label="Policy intelligence" title="Most violated rules" />
            <div className="heatmap-list">
              {policyViolationShare.map(([label, value, tone]) => (
                <div className={`heatmap-row tone-${tone}`} key={label}>
                  <span>{label}</span>
                  <div><i style={{ width: `${value}%` }} /></div>
                  <strong>{value}%</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="ops-card team-policy-card">
            <PanelTitle label="AI accuracy" title="Reviewer agreement by team" />
            <div className="team-table">
              {teamAnalytics.map((team) => (
                <div key={team.team}>
                  <span>{team.team}</span>
                  <strong>{team.score}%</strong>
                  <small>{team.scanned} scans · {team.risks} risks</small>
                </div>
              ))}
            </div>
          </section>
          <section className="ops-card">
            <PanelTitle label="Unsafe phrase patterns" title="Repeated communication risk" />
            <div className="insight-list">
              <div><MessageSquareWarning size={16} /> Guaranteed refund language in sales outreach</div>
              <div><MessageSquareWarning size={16} /> Customer records shared outside approved systems</div>
              <div><MessageSquareWarning size={16} /> Forward-looking claims without finance disclaimer</div>
            </div>
          </section>
        </div>
      </section>
    </WorkspaceShell>
  );
}

export function AnalyticsPage() {
  const role = typeof window !== "undefined" && window.localStorage.getItem("complylens-role") === "admin" ? "admin" : "employee";
  return role === "admin" ? <AdminReports /> : <EmployeeReports />;
}
