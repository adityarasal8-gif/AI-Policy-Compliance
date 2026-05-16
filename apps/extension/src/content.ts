import { applyRewrite, type ComplianceReport, type RewriteResponse, type Violation } from "@complylens/shared";

const FAB_ID = "complylens-gmail-fab";
const TOOLTIP_ID = "complylens-gmail-tooltip";

type TooltipState = "loading" | "ready" | "error";

type DraftSnapshot = {
  subject: string;
  body: string;
  combined: string;
};

const AUTO_SCAN_IDLE_MS = 900;
const AUTO_SCAN_MIN_BODY_CHARS = 12;
const AUTO_SCAN_MIN_SUBJECT_CHARS = 3;

let latestReport: ComplianceReport | null = null;
let latestSubject = "";
let latestBody = "";
let latestCombined = "";
let lastScanAt = 0;
let liveScanTimer = 0;

function getApiBaseUrl() {
  return new Promise<string>((resolve) => {
    chrome.storage?.sync?.get(["complylensApiBaseUrl"], (result) => {
      resolve(result.complylensApiBaseUrl || "http://127.0.0.1:8000");
    });
  });
}

function getCompose() {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('[role="textbox"][aria-label*="Message Body"]')
  );
  if (!candidates.length) return null;

  const visible = candidates.filter((element) => {
    if (element.getAttribute("aria-hidden") === "true") return false;
    return element.getClientRects().length > 0;
  });

  return (visible.length ? visible[visible.length - 1] : candidates[candidates.length - 1]) ?? null;
}

function getComposeText() {
  return getCompose()?.innerText ?? "";
}

function getComposeAnchor() {
  const compose = getCompose();
  if (!compose) return null;
  return compose.closest<HTMLElement>('div[role="dialog"]') ?? compose;
}

function getSubjectInput() {
  const anchor = getComposeAnchor();
  if (!anchor) return null;
  return anchor.querySelector<HTMLInputElement>('input[name="subjectbox"], textarea[name="subjectbox"]');
}

function getSubjectText() {
  return getSubjectInput()?.value ?? "";
}

function setSubjectText(text: string) {
  const subject = getSubjectInput();
  if (!subject) return false;
  subject.focus();
  subject.value = text;
  subject.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function getDraftSnapshot(): DraftSnapshot {
  const subject = getSubjectText().trim();
  const body = getComposeText().trim();
  const combined = [subject ? `Subject: ${subject}` : "", body ? `Body:\n${body}` : ""]
    .filter(Boolean)
    .join("\n\n");
  return { subject, body, combined };
}

function getCurrentState() {
  return {
    snapshot: getDraftSnapshot(),
    report: latestReport,
  };
}

function setLatestSnapshot(snapshot: DraftSnapshot) {
  latestSubject = snapshot.subject;
  latestBody = snapshot.body;
  latestCombined = snapshot.combined;
}

function setComposeText(text: string) {
  const compose = getCompose();
  if (!compose) return false;
  compose.focus();
  compose.innerText = text;
  compose.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  return true;
}

async function analyzeDraft(text: string) {
  const payload = { text, documentName: "gmail-draft", threshold: 0.62 };

  // Prefer extension-level fetch via background service worker to avoid CORS from page origin.
  if (chrome.runtime && chrome.runtime.sendMessage) {
    return new Promise<ComplianceReport>((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "analyze", payload }, (response) => {
        if (!response) return reject(new Error("No response from background"));
        if (!response.ok) return reject(new Error(response.text || response.error || `status=${response.status}`));
        try {
          resolve(response.json as ComplianceReport);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  const apiBaseUrl = await getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as ComplianceReport;
}

async function rewriteDraftText(text: string, policyContext?: string) {
  const payload = { text, policyContext };

  if (chrome.runtime && chrome.runtime.sendMessage) {
    return new Promise<RewriteResponse>((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "rewrite", payload }, (response) => {
        if (!response) return reject(new Error("No response from background"));
        if (!response.ok) return reject(new Error(response.text || response.error || `status=${response.status}`));
        try {
          resolve(response.json as RewriteResponse);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  const apiBaseUrl = await getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/rewrite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as RewriteResponse;
}

function setStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
  Object.assign(element.style, styles);
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { text?: string; id?: string; styles?: Partial<CSSStyleDeclaration> } = {}
) {
  const element = document.createElement(tag);
  if (options.id) element.id = options.id;
  if (options.text) element.textContent = options.text;
  if (options.styles) setStyles(element, options.styles);
  return element;
}

function ensureFab() {
  let fab = document.getElementById(FAB_ID) as HTMLButtonElement | null;
  if (fab) return fab;

  fab = createElement("button", { id: FAB_ID }) as HTMLButtonElement;
  fab.setAttribute("aria-label", "Scan this Gmail draft with ComplyLens");
  fab.textContent = "CL";
  setStyles(fab, {
    position: "fixed",
    zIndex: "2147483647",
    width: "46px",
    height: "46px",
    border: "0",
    borderRadius: "999px",
    background: "linear-gradient(135deg,#1e3a8a,#6366f1 55%,#22c55e)",
    color: "#fff",
    font: "800 12px 'Space Grotesk','IBM Plex Sans','Work Sans',sans-serif",
    letterSpacing: "0.06em",
    boxShadow: "0 18px 40px rgba(79,70,229,.28)",
    cursor: "pointer",
    display: "none"
  });
  fab.addEventListener("click", () => void scanDraft());
  document.body.appendChild(fab);
  return fab;
}

function ensureTooltip() {
  let tooltip = document.getElementById(TOOLTIP_ID);
  if (tooltip) return tooltip;

  tooltip = createElement("section", { id: TOOLTIP_ID });
  setStyles(tooltip, {
    position: "fixed",
    zIndex: "2147483647",
    width: "332px",
    padding: "14px",
    border: "1px solid rgba(148,163,184,.22)",
    borderRadius: "18px",
    background: "linear-gradient(160deg, rgba(255,255,255,.98), rgba(248,250,252,.9))",
    color: "#0f172a",
    font: "13px 'Space Grotesk','IBM Plex Sans','Work Sans',sans-serif",
    boxShadow: "0 20px 46px rgba(15,23,42,.18)",
    backdropFilter: "blur(14px)",
    display: "none"
  });
  document.body.appendChild(tooltip);
  return tooltip;
}

function hideTooltip() {
  const tooltip = ensureTooltip();
  tooltip.style.display = "none";
}

function findQuoteRect(quote: string) {
  const compose = getCompose();
  if (!compose || !quote.trim()) return null;

  const walker = document.createTreeWalker(compose, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node.textContent ?? "";
    const start = text.indexOf(quote);
    if (start >= 0) {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + quote.length);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        return rect;
      }
    }
    node = walker.nextNode();
  }
  return null;
}

function positionFab() {
  const fab = ensureFab();
  const anchor = getComposeAnchor();
  if (!anchor) {
    fab.style.display = "none";
    hideTooltip();
    return;
  }

  const rect = anchor.getBoundingClientRect();
  fab.style.display = "grid";
  fab.style.placeItems = "center";
  fab.style.left = `${Math.max(16, rect.right - 56)}px`;
  fab.style.top = `${Math.max(16, rect.bottom - 56)}px`;
}

function positionTooltip(quote?: string, source: "Subject" | "Body" = "Body") {
  const tooltip = ensureTooltip();
  const anchor = getComposeAnchor();
  if (!anchor) return;

  const quoteRect = quote && source === "Body" ? findQuoteRect(quote) : null;
  const anchorRect = quoteRect ?? anchor.getBoundingClientRect();
  const top = Math.max(16, anchorRect.top - 12);
  const left = Math.min(window.innerWidth - 336, anchorRect.right + 12);

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${Math.max(16, left)}px`;
}

function actionButton(label: string, accent = false) {
  const button = createElement("button", { text: label }) as HTMLButtonElement;
  setStyles(button, {
    minHeight: "34px",
    padding: "0 12px",
    border: accent ? "0" : "1px solid rgba(148,163,184,.24)",
    borderRadius: "999px",
    background: accent ? "linear-gradient(135deg,#4f46e5,#6d5dfc)" : "rgba(248,250,252,.94)",
    color: accent ? "#fff" : "#0f172a",
    fontWeight: "800",
    cursor: "pointer"
  });
  return button;
}

function isSubjectViolation(violation: Violation) {
  return Boolean(violation.quote) && latestSubject.includes(violation.quote);
}

function renderTooltip(state: TooltipState, message = "") {
  const tooltip = ensureTooltip();
  tooltip.replaceChildren();

  const header = createElement("div");
  setStyles(header, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "10px"
  });

  const title = createElement("strong", { text: "ComplyLens" });
  setStyles(title, { fontSize: "14px", letterSpacing: "0.02em" });
  header.append(title);

  if (latestReport) {
    const score = createElement("span", { text: `${latestReport.score}%` });
    setStyles(score, {
      padding: "4px 8px",
      borderRadius: "999px",
      background: latestReport.flaggedSections ? "rgba(251,191,36,.2)" : "rgba(16,185,129,.16)",
      color: latestReport.flaggedSections ? "#92400e" : "#047857",
      fontWeight: "800"
    });
    header.append(score);
  }
  tooltip.append(header);

  const meta = createElement("div");
  setStyles(meta, {
    display: "grid",
    gap: "6px",
    marginBottom: "10px",
    padding: "10px",
    borderRadius: "14px",
    border: "1px solid rgba(148,163,184,.16)",
    background: "rgba(248,250,252,.8)"
  });
  const subjectText = latestSubject || "No subject yet";
  const subjectLine = createElement("div", { text: `Subject: ${subjectText}` });
  setStyles(subjectLine, { fontWeight: "700", color: "#1f2937" });
  const bodyMeta = createElement("div", { text: `Body: ${latestBody ? `${latestBody.split(/\s+/).filter(Boolean).length} words` : "empty"}` });
  setStyles(bodyMeta, { color: "#64748b" });
  meta.append(subjectLine, bodyMeta);
  tooltip.append(meta);

  if (state === "loading") {
    tooltip.append(createElement("p", { text: "Scanning this draft..." }));
    setStyles(tooltip.lastElementChild as HTMLElement, { margin: "0", color: "#64748b", lineHeight: "1.5" });
    tooltip.style.display = "block";
    positionTooltip();
    return;
  }

  if (state === "error") {
    const error = createElement("p", { text: message });
    setStyles(error, { margin: "0", color: "#991b1b", lineHeight: "1.5" });
    tooltip.append(error);
    tooltip.style.display = "block";
    positionTooltip();
    return;
  }

  const violation = latestReport?.violations[0];
  if (!violation) {
    const ok = createElement("p", { text: latestReport?.summary ?? "No policy issues found." });
    setStyles(ok, { margin: "0", color: "#047857", lineHeight: "1.5" });
    tooltip.append(ok);
    tooltip.style.display = "block";
    positionTooltip();
    return;
  }

  tooltip.append(violationCard(violation));
  tooltip.style.display = "block";
  const source = isSubjectViolation(violation) ? "Subject" : "Body";
  positionTooltip(violation.quote, source);
}

function violationCard(violation: Violation) {
  const wrap = createElement("div");
  setStyles(wrap, { display: "grid", gap: "10px" });

  const policyRef = createElement("div");
  setStyles(policyRef, {
    padding: "10px",
    borderRadius: "14px",
    background: "rgba(251,191,36,.14)",
    color: "#92400e"
  });
  const policyTitle = createElement("strong", { text: "Policy reference" });
  setStyles(policyTitle, { display: "block", marginBottom: "4px" });
  const source = isSubjectViolation(violation) ? "Subject" : "Body";
  const policyText = createElement("span", { text: `${violation.policySection} | ${source}` });
  policyRef.append(policyTitle, policyText);

  const why = createElement("div");
  setStyles(why, {
    padding: "10px",
    borderRadius: "14px",
    background: "rgba(248,250,252,.96)"
  });
  const whyTitle = createElement("strong", { text: "Why this matters" });
  setStyles(whyTitle, { display: "block", marginBottom: "4px" });
  const whyText = createElement("span", { text: violation.explanation });
  setStyles(whyText, { color: "#475569", lineHeight: "1.5" });
  why.append(whyTitle, whyText);

  const rewrite = createElement("div");
  setStyles(rewrite, {
    padding: "10px",
    borderRadius: "14px",
    background: "rgba(236,253,245,.9)",
    color: "#047857"
  });
  const rewriteTitle = createElement("strong", { text: "Suggested rewrite" });
  setStyles(rewriteTitle, { display: "block", marginBottom: "4px" });
  const rewriteText = createElement("span", { text: violation.rewrite });
  setStyles(rewriteText, { lineHeight: "1.5" });
  rewrite.append(rewriteTitle, rewriteText);

  const actions = createElement("div");
  setStyles(actions, { display: "flex", gap: "8px", flexWrap: "wrap" });

  const apply = actionButton("Apply rewrite", true);
  apply.addEventListener("click", () => void applyFirstRewrite());

  const rescan = actionButton("Rescan");
  rescan.addEventListener("click", () => void scanDraft());

  const dismiss = actionButton("Hide");
  dismiss.addEventListener("click", () => hideTooltip());

  actions.append(apply, rescan, dismiss);
  wrap.append(policyRef, why, rewrite, actions);
  return wrap;
}

async function applyFirstRewrite() {
  const violation = latestReport?.violations[0];
  if (!violation) return;
  const appliesToSubject = isSubjectViolation(violation);
  let snapshot: DraftSnapshot | null = null;
  try {
    const nextSubject = appliesToSubject ? applyRewrite(latestSubject, violation) : latestSubject;
    const nextBody = appliesToSubject ? latestBody : applyRewrite(latestBody, violation);
    if (appliesToSubject) {
      if (!setSubjectText(nextSubject)) {
        renderTooltip("error", "Could not update the Gmail subject field.");
        return;
      }
    } else if (!setComposeText(nextBody)) {
      renderTooltip("error", "Could not update the current Gmail compose box.");
      return;
    }
    snapshot = {
      subject: nextSubject,
      body: nextBody,
      combined: [nextSubject ? `Subject: ${nextSubject}` : "", nextBody ? `Body:\n${nextBody}` : ""]
        .filter(Boolean)
        .join("\n\n")
    };
    setLatestSnapshot(snapshot);
    try {
      latestReport = await analyzeDraft(snapshot.combined);
    } catch {
      latestReport = null;
    }
    lastScanAt = Date.now();
    renderTooltip("ready");
  } catch (error) {
    renderTooltip("error", `Backend rewrite unavailable. ${error instanceof Error ? error.message.slice(0, 120) : ""}`);
  }
}

async function scanDraft(snapshot?: DraftSnapshot) {
  const next = snapshot ?? getDraftSnapshot();
  setLatestSnapshot(next);
  if (!next.subject && !next.body) {
    latestReport = null;
    renderTooltip("error", "Open a Gmail compose window and enter draft text first.");
    return;
  }

  renderTooltip("loading");
  try {
    latestReport = await analyzeDraft(next.combined);
    lastScanAt = Date.now();
    renderTooltip("ready");
  } catch (error) {
    latestReport = null;
    lastScanAt = Date.now();
    renderTooltip("error", `Backend unavailable. ${error instanceof Error ? error.message.slice(0, 120) : ""}`);
  }
}

function scheduleLiveScan() {
  window.clearTimeout(liveScanTimer);
  liveScanTimer = window.setTimeout(() => {
    const next = getDraftSnapshot();
    const shouldScan = next.body.length >= AUTO_SCAN_MIN_BODY_CHARS || next.subject.length >= AUTO_SCAN_MIN_SUBJECT_CHARS;
    if (!shouldScan) return;
    if (next.combined === latestCombined) return;
    if (Date.now() - lastScanAt < 1100) return;
    void scanDraft(next);
  }, AUTO_SCAN_IDLE_MS);
}

function bootstrap() {
  ensureFab();
  ensureTooltip();
  positionFab();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "getSnapshot") {
    sendResponse(getCurrentState());
    return false;
  }

  if (message?.type === "scanCurrentDraft") {
    void scanDraft().then(() => sendResponse(getCurrentState())).catch((error) => {
      sendResponse({ snapshot: getDraftSnapshot(), report: null, error: (error as Error).message });
    });
    return true;
  }

  if (message?.type === "applyCurrentRewrite") {
    void applyFirstRewrite().then(() => sendResponse({ ok: true })).catch((error) => {
      sendResponse({ ok: false, error: (error as Error).message });
    });
    return true;
  }

  return false;
});

bootstrap();
setInterval(positionFab, 1200);
window.addEventListener("resize", positionFab);
window.addEventListener("scroll", positionFab, true);
document.addEventListener("input", scheduleLiveScan, true);
