import { useRef } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  CircleGauge,
  FileSearch,
  Fingerprint,
  LockKeyhole,
  MailCheck,
  Radar,
  ShieldCheck,
  Sparkles,
  Wand2,
  Workflow,
  Zap
} from "lucide-react";
import { Link } from "react-router-dom";
import { homepageFeatures, workflowSteps } from "../data/productData";
import { TopNav } from "../layouts/TopNav";

export function LandingPage() {
  const frameRef = useRef<number>();
  const easeOut = [0.22, 1, 0.36, 1] as const;
  const sectionReveal = {
    initial: { opacity: 0, y: 28 },
    transition: { duration: 0.48, ease: easeOut },
    viewport: { once: true, amount: 0.22 },
    whileInView: { opacity: 1, y: 0 }
  };

  return (
    <main className="site-shell">
      <TopNav />
      <section
        className="hero-section"
        onMouseMove={(event) => {
          if (frameRef.current) {
            cancelAnimationFrame(frameRef.current);
          }
          const bounds = event.currentTarget.getBoundingClientRect();
          const target = event.currentTarget;
          const x = ((event.clientX - bounds.left) / bounds.width) * 100;
          const y = ((event.clientY - bounds.top) / bounds.height) * 100;
          const xPx = event.clientX - bounds.left;
          const yPx = event.clientY - bounds.top;
          frameRef.current = requestAnimationFrame(() => {
            target.style.setProperty("--cursor-x", `${x}%`);
            target.style.setProperty("--cursor-y", `${y}%`);
            target.style.setProperty("--cursor-x-px", `${xPx}px`);
            target.style.setProperty("--cursor-y-px", `${yPx}px`);
          });
        }}
      >
        <div className="cursor-spotlight" aria-hidden="true" />
        <div className="hero-orbit" aria-hidden="true" />
        <div className="hero-grid-glow" aria-hidden="true" />
        <motion.div animate={{ opacity: 1, y: 0 }} className="hero-content" initial={{ opacity: 0, y: 18 }} transition={{ duration: 0.52, ease: easeOut }}>
          <div className="hero-eyebrow">
            <Sparkles size={15} />
            Policy-aware review engine
          </div>
          <h1>
            AI compliance review for every <span>enterprise message.</span>
          </h1>
          <p>
            ComplyLens scans emails and documents against company policies, explains the risk, and rewrites sensitive
            language before it leaves the business.
          </p>
          <div className="hero-proof-strip" aria-label="Platform highlights">
            <span><LockKeyhole size={15} /> Policy grounded</span>
            <span><Zap size={15} /> 0.9s scan</span>
            <span><Fingerprint size={15} /> Audit ready</span>
          </div>
          <div className="hero-actions">
            <Link className="primary-action" to="/dashboard">
              Start Scanning <ArrowRight size={16} />
            </Link>
            <Link className="secondary-action" to="/extension">
              Watch Preview <MailCheck size={16} />
            </Link>
          </div>
        </motion.div>

        <motion.div animate={{ opacity: 1, x: 0 }} className="hero-visual" initial={{ opacity: 0, x: 24 }} transition={{ delay: 0.12, duration: 0.54, ease: easeOut }}>
          <div className="floating-token token-a"><Radar size={15} /> Live</div>
          <div className="floating-token token-b"><CircleGauge size={15} /> 88%</div>
          <div className="analysis-panel elevated">
            <div className="panel-kicker">
              <span className="scan-dot" />
              Live AI review
            </div>
            <h2>Vendor email draft</h2>
            <div className="document-lines">
              <span />
              <span />
              <span className="line-risk" />
              <span />
            </div>
            <div className="risk-chip critical">High risk · Customer data</div>
          </div>
          <div className="analysis-panel policy-card">
            <ShieldCheck size={18} />
            <strong>Policy match</strong>
            <p>Customer records cannot be shared outside approved systems.</p>
          </div>
          <div className="analysis-panel rewrite-card">
            <Wand2 size={18} />
            <strong>Safe rewrite</strong>
            <p>Use the approved secure transfer link after access is authorized.</p>
          </div>
          <div className="scan-beam" />
        </motion.div>
      </section>

      <section className="home-section workflow-showcase">
        <motion.div className="section-heading" {...sectionReveal}>
          <span className="section-icon"><Workflow size={18} /> Review pipeline</span>
          <h2>One clear workflow from policy to rewrite.</h2>
          <p>Every scan follows a simple, traceable loop built for legal, security, HR, and finance teams.</p>
        </motion.div>
        <div className="workflow-map">
          {workflowSteps.slice(0, 4).map((step, index) => (
            <motion.article className="workflow-node" initial={{ opacity: 0, y: 22 }} key={step.title} transition={{ delay: index * 0.08, duration: 0.42, ease: easeOut }} viewport={{ once: true, amount: 0.18 }} whileHover={{ y: -8, rotate: index % 2 ? -1 : 1 }} whileInView={{ opacity: 1, y: 0 }}>
              <span className="node-index">0{index + 1}</span>
              <span className="premium-icon">
                <step.icon size={20} />
              </span>
              <strong>{step.title}</strong>
              <p>{step.copy}</p>
              <span className="node-connector" aria-hidden="true" />
            </motion.article>
          ))}
        </div>
        <div className="workflow-visual" aria-hidden="true">
          <span><FileSearch size={16} /> policies</span>
          <i />
          <span><Radar size={16} /> risk signal</span>
          <i />
          <span><Wand2 size={16} /> rewrite</span>
        </div>
      </section>

      <section className="home-section feature-stage" id="features">
        <motion.div className="section-heading" {...sectionReveal}>
          <span className="section-icon"><ShieldCheck size={18} /> Governance controls</span>
          <h2>Built for operational AI governance, not another inbox plugin.</h2>
          <p>Fewer alerts, stronger context, and a calmer interface for reviewing high-stakes communication.</p>
        </motion.div>
        <div className="feature-rail">
          {homepageFeatures.slice(0, 3).map((feature, index) => (
            <motion.article className="feature-card" initial={{ opacity: 0, y: 22 }} key={feature.title} transition={{ delay: index * 0.08, duration: 0.42, ease: easeOut }} viewport={{ once: true, amount: 0.18 }} whileHover={{ y: -8 }} whileInView={{ opacity: 1, y: 0 }}>
              <span className="premium-icon">
                <feature.icon size={20} />
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
              <div className="feature-meter" aria-hidden="true">
                <span style={{ width: `${78 + index * 7}%` }} />
              </div>
              <div className="feature-icon-row" aria-hidden="true">
                <ShieldCheck size={15} />
                <Radar size={15} />
                <CheckCircle2 size={15} />
              </div>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="home-section extension-preview-section" id="preview">
        <motion.div {...sectionReveal}>
          <span className="section-icon"><MailCheck size={18} /> Gmail extension</span>
          <h2>Gmail checks that feel native to the way teams already work.</h2>
          <p>
            The extension scans compose text, cites the matched policy, and inserts a compliant rewrite without moving
            users into a separate review tool.
          </p>
          <div className="preview-signal-list">
            <span><Radar size={16} /> Compose scan</span>
            <span><ShieldCheck size={16} /> Policy citation</span>
            <span><Wand2 size={16} /> One-click rewrite</span>
          </div>
          <div className="hero-actions">
            <Link className="primary-action" to="/extension">
              View extension <MailCheck size={16} />
            </Link>
          </div>
        </motion.div>
        <motion.div className="gmail-mock" initial={{ opacity: 0, scale: 0.96, y: 24 }} transition={{ duration: 0.5, ease: easeOut }} viewport={{ once: true, amount: 0.22 }} whileInView={{ opacity: 1, scale: 1, y: 0 }}>
          <div className="gmail-topbar">New message <span>ComplyLens active</span></div>
          <p>We can guarantee delivery by June 14 and offer a full refund if the launch slips.</p>
          <div className="gmail-warning">Legal commitment detected · 88% confidence</div>
          <div className="gmail-policy-card">
            <ShieldCheck size={16} />
            <span>Commercial Communications Policy matched</span>
          </div>
          <button type="button">Apply compliant rewrite</button>
        </motion.div>
      </section>

      <section className="home-section final-cta-section" id="cta">
        <motion.div {...sectionReveal}>
          <Sparkles size={30} />
          <h2>Deploy policy-aware AI where communication risk actually starts.</h2>
          <p>Start with document review, extend into Gmail, and build toward organization-specific compliance memory.</p>
          <div className="cta-icon-cloud" aria-hidden="true">
            <span><FileSearch size={17} /></span>
            <span><Radar size={17} /></span>
            <span><ShieldCheck size={17} /></span>
            <span><Wand2 size={17} /></span>
          </div>
          <Link className="primary-action" to="/dashboard">
            Open ComplyLens <CheckCircle2 size={16} />
          </Link>
        </motion.div>
      </section>
    </main>
  );
}
