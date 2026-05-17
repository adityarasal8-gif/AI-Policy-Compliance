import { ChangeEvent, useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, Database, FileSearch, GitBranch, Layers3, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { type PolicyComparison, type PolicyReference } from "@complylens/shared";
import { useAuth } from "../auth/useAuth";
import { comparePolicyVersions, getHealth, listPolicyVersions, togglePolicyReference, uploadPolicyDocument } from "../api/complianceApi";
import { NoticeBox } from "../components/common/NoticeBox";
import { PanelTitle } from "../components/common/PanelTitle";
import { WorkspaceShell } from "../layouts/WorkspaceShell";
import type { Notice } from "../types";

export function PoliciesPage() {
  const { profile } = useAuth();
  const role = profile?.role ?? "employee";
  const [notice, setNotice] = useState<Notice>(null);
  const [uploading, setUploading] = useState(false);
  const [policyVersions, setPolicyVersions] = useState<PolicyReference[]>([]);
  const [policyChunks, setPolicyChunks] = useState<number>(0);
  const [comparison, setComparison] = useState<PolicyComparison | null>(null);
  const enabledPolicies = policyVersions.filter((policy) => policy.enabled !== false).length;
  const coverageAreas = Array.from(new Set(policyVersions.map((policy) => policy.owner))).filter(Boolean);
  const latestPolicy = policyVersions[0];

  useEffect(() => {
    void refreshPolicyVersions();
    void refreshHealth();
  }, []);

  async function refreshHealth() {
    try {
      const health = await getHealth();
      setPolicyChunks(health.policy_chunks);
    } catch {
      setPolicyChunks(0);
    }
  }

  async function refreshPolicyVersions() {
    try {
      const versions = await listPolicyVersions();
      setPolicyVersions(versions);
      if (versions[0]) {
        void loadComparison(versions[0].policy);
      }
    } catch {
      setPolicyVersions([]);
      setComparison(null);
    }
  }

  async function loadComparison(policy: string) {
    try {
      setComparison(await comparePolicyVersions(policy));
    } catch {
      setComparison(null);
    }
  }

  async function uploadPolicy(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setNotice(null);
    try {
      const result = await uploadPolicyDocument(file);
      await refreshPolicyVersions();
      await refreshHealth();
      setNotice({ kind: "success", text: `Uploaded ${file.name} and indexed ${result.chunks} policy chunks.` });
    } catch (error) {
      setNotice({
        kind: "error",
        text: `Policy upload failed. Start backend with backend/requirements.txt installed. ${error instanceof Error ? error.message.slice(0, 120) : ""}`
      });
    } finally {
      setUploading(false);
    }
  }

  async function togglePolicy(policy: PolicyReference) {
    try {
      const updated = await togglePolicyReference(policy.id, !(policy.enabled ?? true));
      setPolicyVersions((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setNotice({ kind: "success", text: `${updated.policy} is now ${updated.enabled ? "enabled" : "disabled"} at version ${updated.version}.` });
    } catch (error) {
      setNotice({ kind: "error", text: `Could not update policy. ${error instanceof Error ? error.message.slice(0, 120) : ""}` });
    }
  }

  return (
    <WorkspaceShell role={role}>
      <section className="page-panel simple-dashboard">
        {role !== "admin" ? (
          <div className="restricted-panel">
            <ShieldCheck size={28} />
            <h1>Admin access required</h1>
            <p>Policy uploads are only available to compliance admins. Employee accounts can run checks and review their own history.</p>
          </div>
        ) : (
          <>
            <div className="workspace-command-bar compact-command-bar policies-command-bar">
              <div>
                <span className="eyebrow">Policy memory</span>
                <h1>Policy operations center</h1>
                <p>Upload company rules, monitor indexing health, and manage the retrieval memory behind every scan.</p>
              </div>
              <div className="workspace-command-status">
                <span><Database size={15} /> {policyChunks} chunks indexed</span>
                <span><GitBranch size={15} /> Live backend health</span>
              </div>
            </div>
            {notice && <NoticeBox notice={notice} onClose={() => setNotice(null)} />}
            <div className="policy-dashboard-grid">
              <section className="policy-main-column">
                <div className="policy-summary-strip">
                  <div>
                    <span className="summary-label"><Layers3 size={14} /> Retrieval index</span>
                    <strong>{policyChunks}</strong>
                    <small>Chunked policy records ready for scans</small>
                  </div>
                  <div>
                    <span className="summary-label"><BadgeCheck size={14} /> Enabled policies</span>
                    <strong>{enabledPolicies}</strong>
                    <small>Active references in the policy store</small>
                  </div>
                  <div>
                    <span className="summary-label"><Sparkles size={14} /> Coverage areas</span>
                    <strong>{coverageAreas.length}</strong>
                    <small>{coverageAreas.length ? coverageAreas.join(" · ") : "No policies loaded yet"}</small>
                  </div>
                </div>

                <div className="policy-upload-panel">
                  <div className="policy-section-head">
                    <div>
                      <span className="eyebrow">Upload pipeline</span>
                      <h2>Drop a policy document into the retrieval memory</h2>
                      <p>PDF, DOC, DOCX, Markdown, rich text, and email exports are parsed by the backend.</p>
                    </div>
                    <div className="policy-upload-note">
                      <Upload size={18} />
                      <span>{uploading ? "Processing file" : "Ready for upload"}</span>
                    </div>
                  </div>
                  <label className="policy-upload-card">
                    <Upload size={22} />
                    <span>
                      <strong>{uploading ? "Uploading policy..." : "Choose a policy file"}</strong>
                      <small>Click to browse. The backend indexes the file and exposes it to policy checks.</small>
                    </span>
                    <ArrowRight size={18} />
                    <input accept=".pdf,.doc,.docx,.eml,.html,.htm,.md,.rtf,.txt" disabled={uploading} onChange={uploadPolicy} type="file" />
                  </label>
                </div>

                <div className="policy-table-panel">
                  <div className="policy-section-head">
                    <div>
                      <span className="eyebrow">Policy library</span>
                      <h2>Loaded references and version controls</h2>
                    </div>
                    <span className="policy-count-pill">{policyVersions.length} records</span>
                  </div>
                  <div className="policy-table">
                    {policyVersions.map((policy) => (
                      <article className={`policy-card ${policy.enabled === false ? "disabled" : ""}`} key={policy.id}>
                        <div className="policy-card-topline">
                          <span className="policy-owner-chip">{policy.owner}</span>
                          <span className={`policy-status-pill ${policy.enabled === false ? "is-disabled" : "is-enabled"}`}>
                            {policy.enabled === false ? "Disabled" : "Enabled"}
                          </span>
                        </div>
                        <div className="policy-card-body">
                          <div>
                            <strong>{policy.policy}</strong>
                            <small>{policy.section} · v{policy.version ?? 1}</small>
                          </div>
                          <p>{policy.text}</p>
                        </div>
                        <div className="policy-card-actions">
                          <button onClick={() => void togglePolicy(policy)} type="button">
                            {policy.enabled === false ? "Enable" : "Disable"}
                          </button>
                          <button className="ghost-button" onClick={() => void loadComparison(policy.policy)} type="button">
                            Compare
                          </button>
                        </div>
                      </article>
                    ))}
                    {!policyVersions.length && (
                      <article className="policy-card policy-card-empty">
                        <div className="policy-card-topline">
                          <span className="policy-owner-chip">Compliance</span>
                        </div>
                        <div className="policy-card-body">
                          <div>
                            <strong>No policies loaded</strong>
                            <small>Upload a company policy to populate the retrieval memory.</small>
                          </div>
                        </div>
                      </article>
                    )}
                  </div>
                </div>
              </section>

              <aside className="policy-side-column">
                <section className="ops-card policy-side-card">
                  <PanelTitle label="Coverage" title="Active systems" />
                  <div className="policy-system-list policy-system-list-modern">
                    {policyVersions.length ? (
                      policyVersions.map((policy) => (
                        <div key={policy.id}>
                          <ShieldCheck size={16} />
                          <span>
                            <strong>{policy.policy}</strong>
                            <small>{policy.section} · {policy.owner}</small>
                          </span>
                          <strong>{policy.enabled === false ? "Disabled" : "Enabled"}</strong>
                        </div>
                      ))
                    ) : (
                      <div>
                        <ShieldCheck size={16} />
                        <span>
                          <strong>Waiting for policy uploads</strong>
                          <small>Backend policies will appear here once loaded.</small>
                        </span>
                        <strong>0</strong>
                      </div>
                    )}
                  </div>
                  <div className="policy-health">
                    <FileSearch size={18} />
                    <strong>Retrieval health: live</strong>
                    <span>Policy chunks and toggles are sourced from the backend policy store.</span>
                  </div>
                </section>

                <section className="ops-card policy-side-card">
                  <div className="policy-section-head">
                    <div>
                      <span className="eyebrow">Version compare</span>
                      <h2>Review the latest policy delta</h2>
                    </div>
                    {latestPolicy ? <span className="policy-count-pill">Latest: v{latestPolicy.version ?? 1}</span> : null}
                  </div>
                  {comparison ? (
                    <div className="policy-compare-card">
                      <strong>{comparison.policy}</strong>
                      <span>Latest v{comparison.latestVersion}{comparison.previousVersion ? ` compared with v${comparison.previousVersion}` : " has no previous upload yet"}</span>
                      <div>
                        <small>Added terms</small>
                        <p>{comparison.addedTerms.length ? comparison.addedTerms.join(", ") : "No major new terms"}</p>
                      </div>
                      <div>
                        <small>Removed terms</small>
                        <p>{comparison.removedTerms.length ? comparison.removedTerms.join(", ") : "No major removed terms"}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="policy-compare-empty">
                      <Sparkles size={18} />
                      <strong>Select a policy to compare versions</strong>
                      <span>The newest upload is loaded automatically when data is available.</span>
                    </div>
                  )}
                </section>
              </aside>
            </div>
          </>
        )}
      </section>
    </WorkspaceShell>
  );
}
