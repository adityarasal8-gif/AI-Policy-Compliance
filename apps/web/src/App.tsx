import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/useAuth";
import { AuthLayout } from "./layouts/AuthLayout";
import { ActivityPage } from "./pages/ActivityPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LandingPage } from "./pages/LandingPage";
import { PoliciesPage } from "./pages/PoliciesPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { ReactNode } from "react";

type WorkspaceRole = "admin" | "employee";

function resolveWorkspaceRole(email: string | null | undefined, role: string | undefined): WorkspaceRole {
  if (role === "admin" || role === "employee") {
    return role;
  }

  return "employee";
}

function ProtectedRoute({ children, role, redirectTo }: { children: ReactNode; role?: WorkspaceRole; redirectTo?: string }) {
  const { loading, profile, user } = useAuth();
  const resolvedRole = resolveWorkspaceRole(user?.email, profile?.role);

  if (loading) {
    return (
      <main className="auth-shell">
        <section className="auth-layout">
          <div className="auth-copy">
            <span className="eyebrow">Secure policy workspace</span>
            <h1>Checking your access.</h1>
            <p>Loading your Firebase session and Firestore profile.</p>
          </div>
        </section>
      </main>
    );
  }

  if (!user) {
    return <Navigate replace to="/auth" />;
  }

  if (role && resolvedRole !== role) {
    return <Navigate replace to={resolvedRole === "admin" ? "/admin" : "/employee"} />;
  }

  if (redirectTo) {
    return <Navigate replace to={redirectTo} />;
  }

  return <>{children}</>;
}

function RoleGate({
  children,
  allow,
  employeeFallback,
  adminFallback
}: {
  children: ReactNode;
  allow: WorkspaceRole;
  employeeFallback: string;
  adminFallback: string;
}) {
  const { loading, profile, user } = useAuth();
  const resolvedRole = resolveWorkspaceRole(user?.email, profile?.role);

  if (loading) {
    return (
      <main className="auth-shell">
        <section className="auth-layout">
          <div className="auth-copy">
            <span className="eyebrow">Secure policy workspace</span>
            <h1>Checking your access.</h1>
            <p>Loading your Firebase session and Firestore profile.</p>
          </div>
        </section>
      </main>
    );
  }

  if (!user) {
    return <Navigate replace to="/auth" />;
  }

  if (resolvedRole !== allow) {
    return <Navigate replace to={resolvedRole === "admin" ? adminFallback : employeeFallback} />;
  }

  return <>{children}</>;
}

function WorkspaceLanding() {
  const { profile, user } = useAuth();
  const role = resolveWorkspaceRole(user?.email, profile?.role);

  return <Navigate replace to={role === "admin" ? "/admin" : "/employee"} />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      
      {/* Unified auth routes: /auth, /auth/login, /auth/signup */}
      <Route path="/auth/*" element={<AuthLayout />} />
      
      {/* Role-aware workspace routes */}
      <Route path="/dashboard" element={<ProtectedRoute><WorkspaceLanding /></ProtectedRoute>} />
      <Route path="/employee" element={<ProtectedRoute role="employee"><DashboardPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute role="admin"><DashboardPage /></ProtectedRoute>} />
      <Route path="/employee/reports" element={<ProtectedRoute role="employee"><AnalyticsPage /></ProtectedRoute>} />
      <Route path="/admin/reports" element={<ProtectedRoute role="admin"><AnalyticsPage /></ProtectedRoute>} />
      <Route path="/history" element={<RoleGate allow="employee" adminFallback="/audit" employeeFallback="/history"><ActivityPage /></RoleGate>} />
      <Route path="/audit" element={<RoleGate allow="admin" adminFallback="/audit" employeeFallback="/history"><ActivityPage /></RoleGate>} />
      <Route path="/policies" element={<RoleGate allow="admin" adminFallback="/audit" employeeFallback="/employee"><PoliciesPage /></RoleGate>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      
      {/* Legacy route redirects for backward compatibility */}
      <Route path="/login" element={<Navigate replace to="/auth/login" />} />
      <Route path="/signup" element={<Navigate replace to="/auth/signup" />} />
      <Route path="/inbox" element={<Navigate replace to="/dashboard" />} />
      <Route path="/analytics" element={<Navigate replace to="/reports" />} />
      <Route path="/reports" element={<ProtectedRoute><WorkspaceLanding /></ProtectedRoute>} />
      <Route path="/activity" element={<RoleGate allow="employee" adminFallback="/audit" employeeFallback="/history"><Navigate replace to="/history" /></RoleGate>} />
      <Route path="/audit-trail" element={<Navigate replace to="/audit" />} />
      <Route path="/history-trail" element={<Navigate replace to="/history" />} />
      <Route path="/extension" element={<Navigate replace to="/settings" />} />
      <Route path="/integrations" element={<Navigate replace to="/settings" />} />
      <Route path="/profile" element={<Navigate replace to="/settings" />} />
      
      {/* Catch-all */}
      <Route path="*" element={<Navigate replace to="/dashboard" />} />
    </Routes>
  );
}
