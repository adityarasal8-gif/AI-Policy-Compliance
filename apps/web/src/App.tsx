import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/useAuth";
import { AuthLayout } from "./layouts/AuthLayout";
import { ActivityPage } from "./pages/ActivityPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LandingPage } from "./pages/LandingPage";
import { PoliciesPage } from "./pages/PoliciesPage";
import { SettingsPage } from "./pages/SettingsPage";

/**
 * RequireRole — Guards dashboard routes with auth + role checks.
 * - Unauthenticated users → /auth
 * - Role-restricted pages → dashboard if not authorized
 */
function RequireRole({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { loading, profile, user } = useAuth();

  // Loading auth state
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

  // Not authenticated → auth flow
  if (!user || !profile) return <Navigate replace to="/auth" />;

  // Admin-only page but user is not admin
  if (adminOnly && profile.role !== "admin") return <Navigate replace to="/dashboard" />;

  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      
      {/* Unified auth routes: /auth, /auth/login, /auth/signup */}
      <Route path="/auth/*" element={<AuthLayout />} />
      
      {/* Dashboard + workspace routes (protected) */}
      <Route path="/dashboard" element={<RequireRole><DashboardPage /></RequireRole>} />
      <Route path="/audit" element={<RequireRole><ActivityPage /></RequireRole>} />
      <Route path="/policies" element={<RequireRole adminOnly><PoliciesPage /></RequireRole>} />
      <Route path="/settings" element={<RequireRole><SettingsPage /></RequireRole>} />
      
      {/* Legacy route redirects for backward compatibility */}
      <Route path="/login" element={<Navigate replace to="/auth/login" />} />
      <Route path="/signup" element={<Navigate replace to="/auth/signup" />} />
      <Route path="/inbox" element={<Navigate replace to="/dashboard" />} />
      <Route path="/analytics" element={<Navigate replace to="/settings" />} />
      <Route path="/activity" element={<Navigate replace to="/audit" />} />
      <Route path="/extension" element={<Navigate replace to="/settings" />} />
      <Route path="/integrations" element={<Navigate replace to="/settings" />} />
      <Route path="/profile" element={<Navigate replace to="/settings" />} />
      
      {/* Catch-all */}
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
