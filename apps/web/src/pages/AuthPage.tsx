import { FormEvent, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, KeyRound, LockKeyhole } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { TopNav } from "../layouts/TopNav";

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const { profile, signIn, signUp, signInWithGoogle, error: authError } = useAuth();
  const [error, setError] = useState("");
  const [role, setRole] = useState<"admin" | "employee">("employee");
  const [submitting, setSubmitting] = useState(false);
  const isSignup = mode === "signup";

  useEffect(() => {
    if (profile) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, profile]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const company = String(form.get("company") ?? "");

    if (!email.includes("@") || password.length < 6) {
      setError("Use a work email and a password with at least 6 characters.");
      return;
    }

    if (isSignup && !company.trim()) {
      setError("Add a company name before creating a workspace.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      if (isSignup) {
        await signUp({ email, password, role, workspaceName: company });
      } else {
        await signIn({ email, password });
      }

      navigate("/dashboard", { replace: true });
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleAuth() {
    const company = formRef.current ? String(new FormData(formRef.current).get("company") ?? "") : "";

    if (isSignup && !company.trim()) {
      setError("Add a company name before creating a workspace with Google.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await signInWithGoogle({ mode: isSignup ? "signup" : "login", role, workspaceName: company });
      navigate("/dashboard", { replace: true });
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Google authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <TopNav compact />
      <section className="auth-layout">
        <div className="auth-copy">
          <span className="eyebrow">Secure policy workspace</span>
          <h1>{isSignup ? "Create a company compliance workspace." : "Login to your compliance review queue."}</h1>
          <p>Manage policies, scan drafts, review citations, and apply safe rewrites from one enterprise workflow.</p>
        </div>
        <motion.section animate={{ opacity: 1, y: 0 }} className="auth-card" initial={{ opacity: 0, y: 16 }}>
          <div className="auth-card-head">
            <div className="auth-icon">{isSignup ? <KeyRound size={20} /> : <LockKeyhole size={20} />}</div>
            <div>
              <h2>{isSignup ? "Create workspace" : "Welcome back"}</h2>
              <p>{isSignup ? "Choose the right access type." : "Continue with your assigned role."}</p>
            </div>
          </div>
          <form ref={formRef} className="auth-form" onSubmit={submit}>
            {isSignup && (
              <div className="auth-role-grid" role="group" aria-label="Choose account type">
                <button className={role === "employee" ? "active" : ""} onClick={() => setRole("employee")} type="button">
                  <strong>Employee</strong>
                  <span>Upload files, run checks, and view history.</span>
                </button>
                <button className={role === "admin" ? "active" : ""} onClick={() => setRole("admin")} type="button">
                  <strong>Admin</strong>
                  <span>Manage policies, users, audit, and simple reports.</span>
                </button>
              </div>
            )}
            {isSignup && (
              <label>
                Company name
                <input name="company" placeholder="Acme Compliance" />
              </label>
            )}
            <label>
              Work email
              <input name="email" placeholder="you@company.com" type="email" />
            </label>
            <label>
              Password
              <input name="password" placeholder="minimum 6 characters" type="password" />
            </label>
            {(error || authError) && <div className="notice error">{error || authError}</div>}
            <button className="auth-google" disabled={submitting} type="button" onClick={handleGoogleAuth}>
              <span className="google-mark">G</span>
              {submitting ? "Working..." : isSignup ? "Sign up with Google" : "Continue with Google"}
              <ArrowRight size={16} />
            </button>
            <div className="auth-divider" aria-hidden="true">
              <span />
              <em>or use email</em>
              <span />
            </div>
            <button className="auth-submit" disabled={submitting} type="submit">
              {submitting ? "Working..." : isSignup ? (role === "admin" ? "Create admin workspace" : "Create employee account") : "Login to workspace"}
              <ArrowRight size={16} />
            </button>
          </form>
          <p className="auth-switch">
            {isSignup ? "Already have access?" : "Need a workspace?"} {" "}
            <Link to={isSignup ? "/login" : "/signup"}>{isSignup ? "Login" : "Sign up"}</Link>
          </p>
        </motion.section>
      </section>
    </main>
  );
}
