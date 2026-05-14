import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUp, BarChart3, CheckCircle2, Database, Download, FileText, History, KeyRound, MailCheck, Paperclip, RefreshCw, ShieldCheck, UploadCloud, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import {
  applyRewrite,
  runDemoComplianceCheck,
  type ComplianceReport,
  type Violation
} from "@complylens/shared";
import { analyzeDocument, analyzeUploadedDocument, listSavedSessions } from "../api/complianceApi";
import { NoticeBox } from "../components/common/NoticeBox";
import { HighlightedEditor } from "../features/compliance/HighlightedEditor";
import { WorkspaceShell } from "../layouts/WorkspaceShell";
import type { Notice } from "../types";
import type { SavedSession } from "@complylens/shared";

type SessionHistoryItem = {
  id: string;
  title: string;
  source: string;
  risk: string;
  time: string;
};

const emptyReport = runDemoComplianceCheck("");
const departments = ["All", "Legal", "Sales", "HR", "Security", "Finance"];

export function DashboardPage() {
  const role = typeof window !== "undefined" && window.localStorage.getItem("complylens-role") === "admin" ? "admin" : "employee";
  const [draft, setDraft] = useState("");
  const [documentName, setDocumentName] = useState("No file selected");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [report, setReport] = useState<ComplianceReport>(emptyReport);
  const [hasRun, setHasRun] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [department, setDepartment] = useState("Sales");
  const [team, setTeam] = useState("Outbound");
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [history, setHistory] = useState<SessionHistoryItem[]>([
    { id: "hist-1", title: "Sales email draft", source: "Email text", risk: "2 issues fixed", time: "Today" },
    { id: "hist-2", title: "Vendor NDA", source: "DOCX upload", risk: "Reviewed", time: "Yesterday" },
    { id: "hist-3", title: "HR announcement", source: "Pasted text", risk: "No issues", time: "May 12" }
  ]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const visibleViolations = report.violations.filter((violation) => !hiddenIds.includes(violation.id));
  const activeViolation = visibleViolations.find((violation) => violation.id === activeId) ?? visibleViolations[0];
  const canAnalyze = Boolean(selectedFile || draft.trim());

  useEffect(() => {
    void refreshSessions();
  }, [department]);

  async function refreshSessions() {
    try {
      setSavedSessions(await listSavedSessions(department));
    } catch {
      setSavedSessions([]);
    }
  }

  function recordHistory(nextReport: ComplianceReport, source: string) {
    const risk = nextReport.violations.length
      ? `${nextReport.violations.length} issue${nextReport.violations.length === 1 ? "" : "s"} found`
      : "No issues";

    setHistory((items) => [
      {
        id: crypto.randomUUID(),
        title: documentName === "No file selected" ? "Typed compliance check" : documentName,
        source,
        risk,
        time: "Just now"
      },
      ...items.slice(0, 5)
    ]);
  }

  async function runAnalysis() {
    if (!canAnalyze) {
      setNotice({ kind: "error", text: "Upload a file or type text before running analysis." });
      return;
    }

    setLoading(true);
    setNotice(null);
    try {
      if (selectedFile) {
        const result = await analyzeUploadedDocument(selectedFile, 0.62, department, team);
        setDraft(result.text);
        setReport(result.report);
        setHasRun(true);
        setActiveId(result.report.violations[0]?.id ?? "");
        setHiddenIds([]);
        recordHistory(result.report, selectedFile.name.split(".").pop()?.toUpperCase() ?? "Upload");
        void refreshSessions();
        setNotice({ kind: "success", text: `Analysis completed for ${selectedFile.name}.` });
        return;
      }

      const nextReport = await analyzeDocument({ text: draft, documentName, threshold: 0.62, department, team });
      setReport(nextReport);
      setHasRun(true);
      setActiveId(nextReport.violations[0]?.id ?? "");
      setHiddenIds([]);
      recordHistory(nextReport, "Typed text");
      void refreshSessions();
      setNotice({ kind: "success", text: "Analysis completed with policy citations." });
    } catch (error) {
      const fallback = runDemoComplianceCheck(draft);
      setReport(fallback);
      setHasRun(true);
      setActiveId(fallback.violations[0]?.id ?? "");
      setHiddenIds([]);
      recordHistory(fallback, selectedFile ? "Upload fallback" : "Text fallback");
      setNotice({
        kind: "error",
        text: `Backend unavailable, showing local analysis. ${error instanceof Error ? error.message.slice(0, 120) : ""}`
      });
    } finally {
      setLoading(false);
    }
  }

  async function selectFile(file: File) {
    setSelectedFile(file);
    setDocumentName(file.name);
    setHasRun(false);
    setReport(emptyReport);
    setActiveId("");
    setHiddenIds([]);
    setNotice({ kind: "success", text: `${file.name} is ready. Click Run Analysis to scan it.` });

    if (/\.(txt|md|html|htm|eml|rtf)$/i.test(file.name)) {
      setDraft(await file.text());
    } else {
      setDraft("");
    }
  }

  function uploadDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void selectFile(file);
    }
    event.target.value = "";
  }

  function handleDrag(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover") {
      event.dataTransfer.dropEffect = "copy";
      setDragActive(true);
    }
    if (event.type === "dragleave") {
      setDragActive(false);
    }
  }

  function dropDocument(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void selectFile(file);
      return;
    }
    setNotice({ kind: "error", text: "Drop one supported document file here." });
  }

  function startNextUpload() {
    setDraft("");
    setDocumentName("No file selected");
    setSelectedFile(null);
    setReport(emptyReport);
    setHasRun(false);
    setActiveId("");
    setHiddenIds([]);
    setNotice(null);
    fileRef.current?.click();
  }

  function applyViolationRewrite(violation: Violation) {
    const nextDraft = applyRewrite(draft, violation);
    setDraft(nextDraft);
    setHiddenIds((ids) => [...new Set([...ids, violation.id])]);
    setNotice({ kind: "success", text: "Rewrite applied to the document draft." });
  }

  function exportReportPdf() {
    if (!hasRun) return;
    const escapePdf = (value: string) => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const lines = [
      "ComplyLens Analysis Report",
      `Document: ${documentName}`,
      `Department: ${department} / ${team}`,
      `Score: ${report.score} | Findings: ${visibleViolations.length} | Status: ${report.status}`,
      `Summary: ${report.summary ?? "No summary"}`,
      "",
      "Findings, citations, and rewrites:",
      ...visibleViolations.flatMap((violation, index) => [
        `${index + 1}. ${violation.policyName} - ${violation.policySection}`,
        `Severity: ${violation.severity} | Confidence: ${Math.round(violation.confidence * 100)}%`,
        `Original: ${violation.quote}`,
        `Why: ${violation.explanation}`,
        `Citation: ${violation.ruleText}`,
        `Suggested rewrite: ${violation.rewrite}`,
        ""
      ])
    ].flatMap((line) => {
      const chunks: string[] = [];
      for (let index = 0; index < line.length; index += 92) chunks.push(line.slice(index, index + 92));
      return chunks.length ? chunks : [""];
    }).slice(0, 38);
    const stream = [
      "BT",
      "/F1 10 Tf",
      "50 785 Td",
      "14 TL",
      ...lines.map((line) => `(${escapePdf(line)}) Tj T*`),
      "ET"
    ].join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xref}\n%%EOF`;
    const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${documentName.replace(/\W+/g, "-") || "analysis-report"}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (role === "admin") {
    return (
      <WorkspaceShell role="admin">
        <section className="ops-dashboard simple-dashboard">
          <div className="workspace-command-bar compact-command-bar">
            <div>
              <h1>Admin Dashboard</h1>
              <p>Manage policies, employee access, audit events, and real-world integration setup from one control surface.</p>
            </div>
            <div className="workspace-command-status">
              <span><ShieldCheck size={15} /> Admin mode</span>
              <span><MailCheck size={15} /> Extension ready</span>
            </div>
          </div>

          <div className="admin-dashboard-grid">
            <Link className="admin-dashboard-card primary" to="/policies">
              <Database size={20} />
              <span>Policy memory</span>
              <strong>829 chunks indexed</strong>
              <small>Upload company rules and monitor retrieval health.</small>
            </Link>
            <Link className="admin-dashboard-card" to="/audit">
              <History size={20} />
              <span>Audit trail</span>
              <strong>7 open events</strong>
              <small>Review scans, rewrites, uploads, and extension activity.</small>
            </Link>
            <Link className="admin-dashboard-card" to="/settings">
              <KeyRound size={20} />
              <span>Integrations</span>
              <strong>API + Extension</strong>
              <small>Generate demo API keys and configure extension/webhook setup.</small>
            </Link>
            <Link className="admin-dashboard-card" to="/settings">
              <UsersRound size={20} />
              <span>Team access</span>
              <strong>12 employees</strong>
              <small>Invite employees and keep policy upload admin-only.</small>
            </Link>
          </div>

          <div className="admin-ops-grid">
            <section className="ops-card wide">
              <div className="admin-section-head">
                <div>
                  <span className="eyebrow">Risk overview</span>
                  <h2>Business value this month</h2>
                </div>
                <BarChart3 size={20} />
              </div>
              <div className="admin-report-grid">
                <div><BarChart3 size={17} /><span>Risk stopped</span><strong>38</strong><small>messages blocked before sending</small></div>
                <div><ShieldCheck size={17} /><span>Rewrite adoption</span><strong>74%</strong><small>safe rewrites accepted</small></div>
                <div><AlertTriangle size={17} /><span>Open escalations</span><strong>7</strong><small>need reviewer decision</small></div>
              </div>
            </section>
            <section className="ops-card">
              <div className="admin-section-head">
                <div>
                  <span className="eyebrow">Next action</span>
                  <h2>Deploy Gmail extension</h2>
                </div>
                <MailCheck size={20} />
              </div>
              <div className="insight-list">
                <div><CheckCircle2 size={16} /> Build extension package</div>
                <div><KeyRound size={16} /> Add API endpoint in Admin</div>
                <div><UsersRound size={16} /> Assign employees after install</div>
              </div>
            </section>
          </div>
        </section>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell>
      <section className="ops-dashboard work-dashboard">
        <div className="workspace-command-bar compact-command-bar">
          <div>
            <h1>Compliance Workspace</h1>
            <p>Upload a file or write text, run one analysis, then review the full result in a focused workspace.</p>
          </div>
          <button className="secondary-action-button" onClick={startNextUpload} type="button">
            <RefreshCw size={15} />
            Upload next
          </button>
        </div>

        <div className="employee-workspace-grid">
          <section className={`employee-analysis-panel ${hasRun ? "has-results" : ""}`}>
            <div className="workspace-input-stage" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={dropDocument}>
              <div className="department-filter-row">
                <label>
                  Department
                  <select value={department} onChange={(event) => setDepartment(event.target.value)}>
                    {departments.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  Team
                  <input value={team} onChange={(event) => setTeam(event.target.value)} />
                </label>
              </div>
              <div
                className={`upload-dropzone-large ${selectedFile ? "is-ready" : ""} ${dragActive ? "is-dragging" : ""}`}
                onClick={() => fileRef.current?.click()}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={dropDocument}
                role="button"
                tabIndex={0}
              >
                <div className="upload-icon-ring">
                  <UploadCloud size={34} />
                </div>
                <strong>{selectedFile ? selectedFile.name : "Drop a document here"}</strong>
                <span>PDF, DOCX, DOC, Markdown, rich text, or pasted content</span>
                <small>{dragActive ? "Release to attach this file" : selectedFile ? "File ready for analysis" : "Click the box or drag a file onto it"}</small>
              </div>

              <div className="workspace-text-entry">
                <div className="composer-meta">
                  <span>
                    <FileText size={16} />
                    {documentName}
                  </span>
                  <span>{draft.trim().split(/\s+/).filter(Boolean).length} words</span>
                </div>
                <textarea
                  aria-label="Write or paste text for compliance analysis"
                  className="composer-textarea"
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setSelectedFile(null);
                    setDocumentName("Typed compliance check");
                    setHasRun(false);
                  }}
                  placeholder="Write or paste text here if you do not want to upload a file."
                  value={draft}
                />
              </div>

              <input accept=".txt,.md,.pdf,.doc,.docx,.eml,.html,.htm,.rtf" hidden onChange={uploadDocument} ref={fileRef} type="file" />

              <div className="analysis-action-row">
                <button className="secondary-action-button" onClick={() => fileRef.current?.click()} type="button">
                  <Paperclip size={16} />
                  Choose file
                </button>
                <button className="primary-work-action run-analysis-button" disabled={loading || !canAnalyze} onClick={() => void runAnalysis()} type="button">
                  <ArrowUp size={16} />
                  {loading ? "Running analysis..." : "Run Analysis"}
                </button>
              </div>
            </div>

            {hasRun && (
              <section className="analysis-results">
                <div className="analysis-results-head">
                  <div>
                    <span className="eyebrow">Analysis result</span>
                    <h2>{visibleViolations.length ? `${visibleViolations.length} policy issue${visibleViolations.length === 1 ? "" : "s"} found` : "No risky language found"}</h2>
                  </div>
                  <button className="secondary-action-button" onClick={startNextUpload} type="button">
                    <UploadCloud size={15} />
                    Upload another
                  </button>
                  <button className="secondary-action-button" onClick={exportReportPdf} type="button">
                    <Download size={15} />
                    Export PDF
                  </button>
                </div>

                <div className="result-workspace">
                  <div className="result-document-pane">
                    <div className="result-pane-title">
                      <FileText size={16} />
                      Original document with highlighted risks
                    </div>
                    <HighlightedEditor draft={draft} mode="preview" onSelectViolation={setActiveId} violations={visibleViolations} />
                  </div>

                  <div className="result-cards-pane">
                    {(visibleViolations.length ? visibleViolations : [activeViolation]).filter(Boolean).map((violation) => (
                      <article className={violation?.id === activeViolation?.id ? "result-finding-card active" : "result-finding-card"} key={violation!.id}>
                        <div className="finding-card-top">
                          <span><AlertTriangle size={14} /> {violation!.severity}</span>
                          <small>{Math.round(violation!.confidence * 100)}% confidence</small>
                        </div>
                        <h3>{violation!.policySection}</h3>
                        <p>{violation!.explanation}</p>
                        <div className="rewrite-box">
                          <strong>Suggested rewrite</strong>
                          <span>{violation!.rewrite}</span>
                        </div>
                        <button onClick={() => applyViolationRewrite(violation!)} type="button">
                          <CheckCircle2 size={15} />
                          Apply safe rewrite
                        </button>
                      </article>
                    ))}
                    {!visibleViolations.length && (
                      <article className="result-finding-card">
                        <div className="finding-card-top">
                          <span><CheckCircle2 size={14} /> Clear</span>
                          <small>Ready to send</small>
                        </div>
                        <h3>No active violations</h3>
                        <p>This draft does not contain the seeded risky language checks.</p>
                      </article>
                    )}
                  </div>
                </div>
              </section>
            )}
            {loading && (
              <div className="analysis-skeleton" aria-label="Analysis loading">
                <span />
                <span />
                <span />
              </div>
            )}
          </section>

          <aside className="employee-history-panel">
            {notice && (
              <div className="history-notice" role="status">
                <NoticeBox notice={notice} onClose={() => setNotice(null)} />
              </div>
            )}
            <div className="rail-header">
              <strong><History size={16} /> Session history</strong>
              <span>{history.length} checks</span>
            </div>
            <div className="history-list">
              {savedSessions.map((session) => (
                <button key={session.id} type="button">
                  <strong>{session.documentName}</strong>
                  <span>{session.department} · {session.team}</span>
                  <small>{session.flaggedSections} issues · score {session.score}</small>
                </button>
              ))}
              {history.map((item) => (
                <button key={item.id} type="button">
                  <strong>{item.title}</strong>
                  <span>{item.source}</span>
                  <small>{item.risk} · {item.time}</small>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </WorkspaceShell>
  );
}
