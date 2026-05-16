import { ChangeEvent, useEffect, useState } from "react";
import { Database, FileSearch, GitBranch, ShieldCheck, Upload } from "lucide-react";
import { type PolicyReference } from "@complylens/shared";
import { useAuth } from "../auth/useAuth";
import { getHealth, listPolicyVersions, togglePolicyReference, uploadPolicyDocument } from "../api/complianceApi";
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
      setPolicyVersions(await listPolicyVersions());
    } catch {
      setPolicyVersions([]);
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
      setPolicyVersions((items) => items.map((item) => item.id === updated.id ? updated : item));
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
        <div className="workspace-command-bar">
          <div>
            <h1>Policy Infrastructure</h1>
            <p>Upload company rules, monitor indexing health, and manage the retrieval memory behind every scan.</p>
          </div>
          <div className="workspace-command-status">
            <span><Database size={15} /> {policyChunks} chunks indexed</span>
            <span><GitBranch size={15} /> Live backend health</span>
          </div>
        </div>
        {notice && <NoticeBox notice={notice} onClose={() => setNotice(null)} />}
        <div className="policy-console">
          <div>
            <label className="large-upload">
              <Upload size={22} />
              <span>
                <strong>{uploading ? "Uploading policy..." : "Upload policy document"}</strong>
                <small>PDF, DOC, DOCX, EML, HTML, Markdown, RTF, and TXT are parsed by the backend.</small>
              </span>
              <input accept=".pdf,.doc,.docx,.eml,.html,.htm,.md,.rtf,.txt" disabled={uploading} onChange={uploadPolicy} type="file" />
            </label>
            <div className="policy-health-grid">
              <div><strong>Indexed chunks</strong><span>{policyChunks}</span></div>
              <div><strong>Loaded policies</strong><span>{policyVersions.length}</span></div>
              <div><strong>Coverage areas</strong><span>{Array.from(new Set(policyVersions.map((policy) => policy.owner))).join(", ") || "None"}</span></div>
            </div>
            <div className="policy-table">
              {policyVersions.map((policy) => (
                <article className={`policy-row wide policy-version-row ${policy.enabled === false ? "disabled" : ""}`} key={policy.id}>
                  <span>{policy.owner}</span>
                  <div>
                    <strong>{policy.policy}</strong>
                    <small>{policy.section} · v{policy.version ?? 1} · {policy.enabled === false ? "Disabled" : "Enabled"}</small>
                    <p>{policy.text}</p>
                  </div>
                  <button onClick={() => void togglePolicy(policy)} type="button">
                    {policy.enabled === false ? "Enable" : "Disable"}
                  </button>
                </article>
              ))}
              {!policyVersions.length && (
                <article className="policy-row wide">
                  <span>Compliance</span>
                  <div>
                    <strong>No policies loaded</strong>
                    <small>Upload a company policy to populate the retrieval memory.</small>
                  </div>
                </article>
              )}
            </div>
          </div>
          <aside className="ops-card">
            <PanelTitle label="Coverage" title="Active systems" />
            <div className="policy-system-list">
              {policyVersions.length ? (
                policyVersions.map((policy) => (
                  <div key={policy.id}>
                    <ShieldCheck size={16} />
                    <span>{policy.policy}</span>
                    <strong>{policy.enabled === false ? "Disabled" : "Enabled"}</strong>
                    <small>{policy.section} · {policy.owner}</small>
                  </div>
                ))
              ) : (
                <div>
                  <ShieldCheck size={16} />
                  <span>Waiting for policy uploads</span>
                  <strong>0</strong>
                  <small>Backend policies will appear here once loaded.</small>
                </div>
              )}
            </div>
            <div className="policy-health">
              <FileSearch size={18} />
              <strong>Retrieval health: live</strong>
              <span>Policy chunks and toggles are sourced from the backend policy store.</span>
            </div>
          </aside>
        </div>
          </>
        )}
      </section>
    </WorkspaceShell>
  );
}
