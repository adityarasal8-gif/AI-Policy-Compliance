import { useRef } from "react";
import { ArrowRight, LogIn, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Brand } from "../components/common/Brand";

export function TopNav({ compact = false }: { compact?: boolean }) {
  const frameRef = useRef<number>();

  return (
    <header
      className="site-nav"
      onMouseMove={(event) => {
        if (frameRef.current) {
          cancelAnimationFrame(frameRef.current);
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        const target = event.currentTarget;
        const x = ((event.clientX - bounds.left) / bounds.width) * 100;
        const y = ((event.clientY - bounds.top) / bounds.height) * 100;
        frameRef.current = requestAnimationFrame(() => {
          target.style.setProperty("--nav-cursor-x", `${x}%`);
          target.style.setProperty("--nav-cursor-y", `${y}%`);
        });
      }}
    >
      <span className="nav-cursor-glow" aria-hidden="true" />
      <Link className="brand-link" to="/">
        <Brand />
      </Link>
      {!compact && (
        <nav>
          <a href="#features"><Sparkles size={14} /> Features</a>
          <Link to="/extension">Extension</Link>
          <a href="#preview">Preview</a>
        </nav>
      )}
      <div className="site-nav-actions">
        <Link className="secondary-action" to="/login">
          <LogIn size={15} /> Login
        </Link>
        <Link className="primary-action nav-signup" to="/signup">
          Sign up <ArrowRight size={15} />
        </Link>
      </div>
    </header>
  );
}
