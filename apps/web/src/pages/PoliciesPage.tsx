import { ChangeEvent, useEffect, useState } from "react";
import { Database, FileSearch, GitBranch, ShieldCheck, Upload } from "lucide-react";
import { samplePolicies, type PolicyReference } from "@complylens/shared";
import { listPolicyVersions, togglePolicyReference, uploadPolicyDocument } from "../api/complianceApi";
import { NoticeBox } from "../components/common/NoticeBox";
import { PanelTitle } from "../components/common/PanelTitle";
import { WorkspaceShell } from "../layouts/WorkspaceShell";
import type { Notice } from "../types";
import { policySystems } from "../data/productData";

export function PoliciesPage() {
  const role = typeof window !== "undefined" && window.localStorage.getItem("complylens-role") === "admin" ? "admin" : "employee";
  const [notice, setNotice] = useState<Notice>(null);
  const [uploading, setUploading] = useState(false);
  const [policyRows, setPolicyRows] = useState(samplePolicies);
  const [policyVersions, setPolicyVersions] = useState<PolicyReference[]>([]);

  useEffect(() => {
    void refreshPolicyVersions();
  }, []);

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
      setPolicyRows((rows) => [
        {
          id: `uploaded-${file.name}`,
          policy: file.name,
          section: `${result.chunks} retrieved chunks`,
          rule: "Uploaded company policy is now available to retrieval.",
          owner: "Legal"
        },
        ...rows
      ]);
      await refreshPolicyVersions();
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
            <span><Database size={15} /> 829 chunks indexed</span>
            <span><GitBranch size={15} /> 94% retrieval health</span>
          </div>
        </div>
        {notice && <NoticeBox notice={notice} onClose={() => setNotice(null)} />}
        <div className="policy-console">
          <div>
            <label className="large-upload">
              <Upload size={22} />
              <span>
                <strong>{uploading ? "Uploading policy..." : "Upload policy document"}</strong>
                <small>PDF, DOC, DOCX, Markdown, rich text, and email exports are parsed by the backend.</small>
              </span>
              <input accept=".pdf,.doc,.docx,.eml,.html,.htm,.md,.rtf,.txt" disabled={uploading} onChange={uploadPolicy} type="file" />
            </label>
            <div className="policy-health-grid">
              <div><strong>Indexed chunks</strong><span>829</span></div>
              <div><strong>Last sync</strong><span>12m ago</span></div>
              <div><strong>Coverage areas</strong><span>Legal, HR, Security, Finance</span></div>
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
              {policyRows.map((policy) => (
                <article className="policy-row wide" key={policy.id}>
                  <span>{policy.owner}</span>
                  <div>
                    <strong>{policy.policy}</strong>
                    <small>{policy.section}</small>
                    <p>{policy.rule}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <aside className="ops-card">
            <PanelTitle label="Coverage" title="Active systems" />
            <div className="policy-system-list">
              {policySystems.map((policy) => (
                <div key={policy.name}>
                  <ShieldCheck size={16} />
                  <span>{policy.name}</span>
                  <strong>{policy.coverage}%</strong>
                  <small>{policy.passages} passages · {policy.owner}</small>
                </div>
              ))}
            </div>
            <div className="policy-health">
              <FileSearch size={18} />
              <strong>Retrieval health: high</strong>
              <span>Policy chunks are returning cited context for 94% of flagged messages.</span>
            </div>
          </aside>
        </div>
          </>
        )}
      </section>
    </WorkspaceShell>
  );
}
