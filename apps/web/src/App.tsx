import { Navigate, Route, Routes } from "react-router-dom";
import { AuthPage } from "./pages/AuthPage";
import { ActivityPage } from "./pages/ActivityPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LandingPage } from "./pages/LandingPage";
import { PoliciesPage } from "./pages/PoliciesPage";
import { SettingsPage } from "./pages/SettingsPage";

function getRole() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("complylens-role");
}

function RequireRole({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const role = getRole();
  if (!role) return <Navigate replace to="/login" />;
  if (adminOnly && role !== "admin") return <Navigate replace to="/dashboard" />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/dashboard" element={<RequireRole><DashboardPage /></RequireRole>} />
      <Route path="/inbox" element={<Navigate replace to="/dashboard" />} />
      <Route path="/analytics" element={<Navigate replace to="/reports" />} />
      <Route path="/reports" element={<RequireRole><AnalyticsPage /></RequireRole>} />
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
