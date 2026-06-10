import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, BadgeCheck, Database, FileSearch, GitBranch, Layers3, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { type PolicyReference } from "@complylens/shared";
import { useAuth } from "../auth/useAuth";
import { deletePolicyDocument, getPolicyFileUrl, listPolicyVersions, togglePolicyReference, uploadPolicyDocument } from "../api/complianceApi";
import { NoticeBox } from "../components/common/NoticeBox";
import { WorkspaceShell } from "../layouts/WorkspaceShell";
import type { Notice } from "../types";

export function PoliciesPage() {
  const { profile } = useAuth();
  const role = profile?.role ?? "employee";
  const [notice, setNotice] = useState<Notice>(null);
  const [uploading, setUploading] = useState(false);
  const [policyVersions, setPolicyVersions] = useState<PolicyReference[]>([]);
  const [policySearch, setPolicySearch] = useState("");
  const enabledPolicies = policyVersions.filter((policy) => policy.enabled !== false).length;
  const filteredPolicies = useMemo(() => {
    const query = policySearch.trim().toLowerCase();
    if (!query) return policyVersions;
    return policyVersions.filter((policy) => {
      const haystack = `${policy.policy} ${policy.section} ${policy.owner} v${policy.version ?? 1}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [policySearch, policyVersions]);

  useEffect(() => {
    void refreshPolicyVersions();
  }, []);

  async function refreshPolicyVersions() {
    try {
      const versions = await listPolicyVersions();
      setPolicyVersions(versions);
    } catch {
      setPolicyVersions([]);
    }
  }

  async function openPolicy(policy: string) {
    try {
      const fileUrl = getPolicyFileUrl(policy);
      const opened = window.open(fileUrl, "_blank", "noopener,noreferrer");
      if (!opened) {
        setNotice({ kind: "error", text: "The policy file could not be opened. Please allow popups for this site." });
      }
    } catch {
      setNotice({ kind: "error", text: "Could not open the policy file right now." });
    }
  }

  async function uploadPolicy(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setNotice(null);
    try {
      await uploadPolicyDocument(file);
      await refreshPolicyVersions();
      // Show a succinct confirmation; do not surface chunk details in the UI
      setNotice({ kind: "success", text: `Uploaded ${file.name} — available in the policy library.` });
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

  async function handleDeletePolicy(policy: PolicyReference) {
    if (!window.confirm(`Are you sure you want to delete ${policy.policy}?`)) return;
    try {
      await deletePolicyDocument(policy.policy);
      setNotice({ kind: "success", text: `${policy.policy} has been deleted.` });
      await refreshPolicyVersions();
    } catch (error) {
      setNotice({ kind: "error", text: `Could not delete policy. ${error instanceof Error ? error.message.slice(0, 120) : ""}` });
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
                <span><Database size={15} /> {policyVersions.length} policy files</span>
                <span><GitBranch size={15} /> Live backend health</span>
              </div>
            </div>
            {notice && <NoticeBox notice={notice} onClose={() => setNotice(null)} />}
            <div>
              <section className="policy-main-column">
                <div className="policy-summary-strip">
                  <div>
                    <span className="summary-label"><Layers3 size={14} /> Policy library</span>
                    <strong>{policyVersions.length}</strong>
                    <small>Uploaded policy files ready for scans</small>
                  </div>
                  <div>
                    <span className="summary-label"><BadgeCheck size={14} /> Enabled policies</span>
                    <strong>{enabledPolicies}</strong>
                    <small>Visible files in the policy library</small>
                  </div>
                  <div>
                    <span className="summary-label"><Sparkles size={14} /> Coverage areas</span>
                    <strong>{Array.from(new Set(policyVersions.map((policy) => policy.owner))).filter(Boolean).length}</strong>
                    <small>{policyVersions.length ? Array.from(new Set(policyVersions.map((policy) => policy.owner))).filter(Boolean).join(" · ") : "No policies loaded yet"}</small>
                  </div>
                </div>

                <div className="policy-upload-panel">
                  <div className="policy-section-head">
                    <div>
                      <span className="eyebrow">Upload pipeline</span>
                      <h2>Drop a policy file into the library</h2>
                      <p>PDF, DOC, DOCX, Markdown, rich text, and email exports are added as a single policy file entry.</p>
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
                      <small>Click to browse. The backend adds the file to the library for checks and version compare.</small>
                    </span>
                    <ArrowRight size={18} />
                    <input accept=".pdf,.doc,.docx,.eml,.html,.htm,.md,.rtf,.txt" disabled={uploading} onChange={uploadPolicy} type="file" />
                  </label>
                </div>

                <div className="policy-table-panel">
                  <div className="policy-section-head">
                    <div>
                      <span className="eyebrow">Policy library</span>
                      <h2>Loaded policy files</h2>
                    </div>
                    <span className="policy-count-pill">{policyVersions.length} files</span>
                  </div>
                  <div className="policy-library-toolbar">
                    <label className="policy-search-box">
                      <span>Search policies</span>
                      <input
                        aria-label="Search policies"
                        placeholder="Policy name, section, owner, version"
                        value={policySearch}
                        onChange={(event) => setPolicySearch(event.target.value)}
                      />
                    </label>
                    <button className="ghost-button" type="button" onClick={() => setPolicySearch("")}>Clear</button>
                  </div>
                  <div className="policy-table policy-table-modern">
                    {filteredPolicies.map((policy) => (
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
                          <p className="muted">File ready for checks. Use Compare to review the latest version changes if needed.</p>
                        </div>
                        <div className="policy-card-actions">
                          <button className="ghost-button" onClick={() => void openPolicy(policy.policy)} type="button">
                            Open PDF
                          </button>
                          <button onClick={() => void togglePolicy(policy)} type="button">
                            {policy.enabled === false ? "Enable" : "Disable"}
                          </button>
                          <button className="ghost-button" onClick={() => void handleDeletePolicy(policy)} type="button">
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                    {!filteredPolicies.length && (
                      <article className="policy-card policy-card-empty">
                        <div className="policy-card-topline">
                          <span className="policy-owner-chip">Compliance</span>
                        </div>
                        <div className="policy-card-body">
                          <div>
                            <strong>{policySearch ? "No matching policies" : "No policies loaded"}</strong>
                            <small>{policySearch ? "Clear the search to see all uploaded files." : "Upload a company policy to populate the policy library."}</small>
                          </div>
                        </div>
                      </article>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </>
        )}
      </section>
    </WorkspaceShell>
  );
}
