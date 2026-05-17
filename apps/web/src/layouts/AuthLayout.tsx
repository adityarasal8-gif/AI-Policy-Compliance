import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { AuthPage } from "../pages/AuthPage";

/**
 * AuthLayout — Unifies login/signup routes under /auth/* paths.
 * - /auth → login
 * - /auth/login → login  
 * - /auth/signup → signup
 * Redirects authenticated users to dashboard.
 */
export function AuthLayout() {
  const { profile } = useAuth();
  const location = useLocation();

  // Already authenticated → redirect to dashboard
  if (profile) {
    return <Navigate to="/dashboard" replace />;
  }

  const isSignup = location.pathname === "/auth/signup";

  return (
    <Routes>
      <Route path="/" element={<AuthPage mode="login" />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="*" element={<Navigate replace to="/auth" />} />
    </Routes>
  );
}
