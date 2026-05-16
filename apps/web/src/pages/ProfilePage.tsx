import { Building2, Gauge, ShieldCheck, UserCircle } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { WorkspaceShell } from "../layouts/WorkspaceShell";

export function ProfilePage() {
  const { profile } = useAuth();
  const profileRows = [
    ["Organization", profile?.workspaceName ?? "Workspace"],
    ["Compliance model", "Seeded enterprise policy"],
    ["Default threshold", "0.62"],
    ["Review owner", "Legal Operations"]
  ];

  return (
    <WorkspaceShell>
      <section className="ops-dashboard workflow-page">
        <div className="workspace-command-bar">
          <div>
            <h1>Organization Profile</h1>
            <p>Company identity, policy model, and governance defaults used across every compliance scan.</p>
          </div>
          <div className="workspace-command-status">
            <span><Building2 size={15} /> Enterprise workspace</span>
            <span><ShieldCheck size={15} /> Policy memory enabled</span>
          </div>
        </div>

        <div className="profile-grid">
          <section className="ops-card profile-card">
            <UserCircle size={22} />
            <strong>{profile?.workspaceName ?? "Workspace"}</strong>
            <p>Multi-team compliance workspace for legal, security, people, finance, and sales communication review.</p>
          </section>
          <section className="ops-card profile-table">
            {profileRows.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </section>
          <section className="ops-card profile-card">
            <Gauge size={22} />
            <strong>Retrieval configuration</strong>
            <p>Policy chunks are ranked locally for the demo backend. Production should connect this profile to a real vector store and reviewer identity model.</p>
          </section>
        </div>
      </section>
    </WorkspaceShell>
  );
}
