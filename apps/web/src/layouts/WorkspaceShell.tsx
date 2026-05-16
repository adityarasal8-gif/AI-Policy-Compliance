import { Activity, Building2, FileText, Home, LogOut, Settings, Shield } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth, type WorkspaceRole } from "../auth/AuthProvider";
import { Brand } from "../components/common/Brand";

type WorkspacePersonalization = {
  accent?: "indigo" | "emerald" | "amber";
  density?: "comfortable" | "compact";
};

function getWorkspaceLinks(role: WorkspaceRole) {
  if (role === "admin") {
    return [
      { to: "/dashboard", label: "Workspace", icon: FileText },
      { to: "/policies", label: "Policies", icon: Shield },
      { to: "/audit", label: "Audit Trail", icon: Activity },
      { to: "/settings", label: "Admin", icon: Settings }
    ];
  }

  return [
    { to: "/dashboard", label: "Workspace", icon: FileText },
    { to: "/audit", label: "History", icon: Activity },
    { to: "/settings", label: "Settings", icon: Settings }
  ];
}

function getPersonalization(): WorkspacePersonalization {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem("complylens-personalization") ?? "{}");
  } catch {
    return {};
  }
}

export function WorkspaceShell({ children, role }: { children: React.ReactNode; role?: WorkspaceRole }) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const activeRole = role ?? profile?.role ?? "employee";
  const workspaceLinks = getWorkspaceLinks(activeRole);
  const personalization = getPersonalization();
  const accent = personalization.accent ?? "indigo";
  const density = personalization.density ?? "comfortable";

  async function logout() {
    await signOut();
    navigate("/login");
  }

  return (
    <main className={`workspace-shell tone-${accent} density-${density}`}>
      <aside className="workspace-sidebar">
        <Link className="brand-link" to="/">
          <Brand />
        </Link>
        <nav aria-label="Workspace navigation" className="workspace-sidebar-nav">
          {workspaceLinks.map((item) => (
            <NavLink className={({ isActive }) => (isActive ? "active" : "")} key={item.to} to={item.to}>
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="workspace-sidebar-footer">
          <div className="workspace-org-card">
            <Building2 size={16} />
            <div>
              <strong>{profile?.workspaceName ?? "Workspace"}</strong>
              <span>{activeRole === "admin" ? "Admin workspace" : "Employee workspace"}</span>
            </div>
          </div>
          <div className="workspace-quick-actions">
            <Link to="/">
              <Home size={15} />
              Home
            </Link>
            <button onClick={logout} type="button">
              <LogOut size={15} />
              Logout
            </button>
          </div>
        </div>
      </aside>
      <section className="workspace-main">{children}</section>
    </main>
  );
}
