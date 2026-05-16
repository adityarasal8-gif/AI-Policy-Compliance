import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/useAuth";
import { AuthPage } from "./pages/AuthPage";
import { ActivityPage } from "./pages/ActivityPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LandingPage } from "./pages/LandingPage";
import { PoliciesPage } from "./pages/PoliciesPage";
import { SettingsPage } from "./pages/SettingsPage";

function RequireRole({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { loading, profile, user } = useAuth();

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

  if (!user || !profile) return <Navigate replace to="/login" />;
  if (adminOnly && profile.role !== "admin") return <Navigate replace to="/dashboard" />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/dashboard" element={<RequireRole><DashboardPage /></RequireRole>} />
      <Route path="/inbox" element={<Navigate replace to="/dashboard" />} />
      <Route path="/analytics" element={<Navigate replace to="/settings" />} />
      <Route path="/activity" element={<Navigate replace to="/audit" />} />
      <Route path="/audit" element={<RequireRole><ActivityPage /></RequireRole>} />
      <Route path="/policies" element={<RequireRole adminOnly><PoliciesPage /></RequireRole>} />
      <Route path="/extension" element={<Navigate replace to="/settings" />} />
      <Route path="/integrations" element={<Navigate replace to="/settings" />} />
      <Route path="/settings" element={<RequireRole><SettingsPage /></RequireRole>} />
      <Route path="/profile" element={<Navigate replace to="/settings" />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
