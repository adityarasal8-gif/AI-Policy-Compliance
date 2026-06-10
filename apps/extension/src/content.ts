import { applyRewrite, type ComplianceReport, type RewriteResponse, type Violation } from "@complylens/shared";

const ROOT_CLASS = "complylens-extension-root";
const HIGHLIGHT_CLASS = "complylens-risk-highlight";
const FAB_ID = "complylens-fab";
const TOOLTIP_ID = "complylens-tooltip";

const AUTO_SCAN_IDLE_MS = 900;
const AUTO_SCAN_MIN_BODY_CHARS = 12;
const AUTO_SCAN_MIN_SUBJECT_CHARS = 3;

const PANEL_MIN_WIDTH = 260;
const PANEL_MAX_WIDTH = 360;
const PANEL_MIN_HEIGHT = 240;
const PANEL_GAP = 16;

type DraftSnapshot = {
  subject: string;
  body: string;
  combined: string;
};

let latestReport: ComplianceReport | null = null;
let latestSubject = "";
let latestBody = "";
let latestCombined = "";
let lastScanAt = 0;
let liveScanTimer = 0;

void initialize();

function initialize() {
  injectStyles();
  positionFab();
  const observer = new MutationObserver(() => {
    positionFab();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });

  window.addEventListener("resize", positionFab, { passive: true });
  window.addEventListener("scroll", positionFab, { passive: true, capture: true });
  document.addEventListener("input", scheduleLiveScan, { passive: true, capture: true });

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
      if (latestReport?.violations[0]) {
        void applyViolationRewrite(latestReport.violations[0]).then(() => sendResponse({ ok: true })).catch((error) => {
          sendResponse({ ok: false, error: (error as Error).message });
        });
      } else {
        sendResponse({ ok: false, error: "No violations to rewrite" });
      }
      return true;
    }

    return false;
  });
}

function injectStyles() {
  if (document.getElementById("complylens-styles")) return;
  const style = document.createElement("style");
  style.id = "complylens-styles";
  style.textContent = `
    ::highlight(complylens-violations) {
      background-color: rgba(254, 226, 226, 0.6);
      text-decoration: underline wavy #ef4444;
      color: #991b1b;
    }
  `;
  document.head.appendChild(style);
}

function getCompose() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('[role="textbox"][aria-label*="Message Body"]'));
  if (!candidates.length) return null;

  const visible = candidates.filter((element) => element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0);
  return (visible.length ? visible[visible.length - 1] : candidates[candidates.length - 1]) ?? null;
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
  subject.select();
  document.execCommand("insertText", false, text);
  return true;
}

function getComposeText() {
  return getCompose()?.innerText ?? "";
}

function setComposeText(text: string) {
  const compose = getCompose();
  if (!compose) return false;
  compose.focus();
  document.execCommand("selectAll", false, undefined);
  document.execCommand("insertText", false, text);
  return true;
}

function replaceQuoteInCompose(quote: string, rewrite: string): boolean {
  const compose = getCompose();
  if (!compose) return false;
  
  compose.focus();
  const selection = window.getSelection();
  if (selection) {
    selection.collapse(compose, 0);
  }
  
  if (window.find(quote, false, false, true, false, false, false)) {
    document.execCommand("insertText", false, rewrite);
    return true;
  }
  
  return false;
}

function getDraftSnapshot(): DraftSnapshot {
  const subject = getSubjectText().trim();
  const body = getComposeText().trim();
  const combined = [subject ? `Subject: ${subject}` : "", body ? `Body:\n${body}` : ""].filter(Boolean).join("\n\n");
  return { subject, body, combined };
}

function setLatestSnapshot(snapshot: DraftSnapshot) {
  latestSubject = snapshot.subject;
  latestBody = snapshot.body;
  latestCombined = snapshot.combined;
}

function getCurrentState() {
  return {
    snapshot: getDraftSnapshot(),
    report: latestReport,
  };
}

async function readApiBaseUrl() {
  return new Promise<string>((resolve) => {
    chrome.storage?.local?.get(["complylensApiBaseUrl"], (result) => {
      resolve(result.complylensApiBaseUrl || "http://127.0.0.1:8000");
    });
  });
}

type BackendPortResponse<T> = {
  ok: boolean;
  status?: number;
  json?: T;
  text?: string;
  error?: string;
};

function requestBackendViaPort<T>(type: "analyze" | "rewrite", payload: Record<string, unknown>) {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const port = chrome.runtime.connect({ name: "complylens-backend" });
    const requestId = `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const finish = (result: T | Error) => {
      if (settled) return;
      settled = true;
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
      try {
        port.disconnect();
      } catch {
        // Ignore disconnect races after the response has already arrived.
      }
    };

    const onMessage = (response: BackendPortResponse<T> & { requestId?: string }) => {
      if (response.requestId !== requestId) return;
      if (!response.ok) {
        finish(new Error(response.text || response.error || `status=${response.status ?? "unknown"}`));
        return;
      }
      if (response.json == null) {
        finish(new Error("No backend response payload"));
        return;
      }
      finish(response.json);
    };

    const onDisconnect = () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        finish(new Error(lastError.message));
        return;
      }
      finish(new Error("Backend connection closed before a response was received."));
    };

    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
    port.postMessage({ requestId, type, payload });
  });
}

async function analyzeDraft(text: string) {
  const payload = { text, documentName: "gmail-draft", threshold: 0.62 };
  return requestBackendViaPort<ComplianceReport>("analyze", payload);
}

async function rewriteDraftText(text: string, policyContext?: string) {
  const payload = { text, policyContext };
  return requestBackendViaPort<RewriteResponse>("rewrite", payload);
}

function setStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
  Object.assign(element.style, styles);
}

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, options: { text?: string; id?: string; styles?: Partial<CSSStyleDeclaration> } = {}) {
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
    font: "800 12px 'Geist', Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    letterSpacing: "0.06em",
    boxShadow: "0 18px 40px rgba(79,70,229,.28)",
    cursor: "pointer",
    display: "none"
  });
  fab.addEventListener("click", () => togglePanel());
  document.body.appendChild(fab);
  return fab;
}

function ensureTooltip() {
  let tooltip = document.getElementById(TOOLTIP_ID);
  if (tooltip) return tooltip;

  // Render a persistent side panel instead of a small tooltip over the compose box.
  tooltip = createElement("aside", { id: TOOLTIP_ID });
  setStyles(tooltip, {
    position: "fixed",
    zIndex: "2147483647",
    width: "360px",
    top: "72px",
    left: "16px",
    height: "calc(100vh - 96px)",
    padding: "14px",
    border: "1px solid rgba(148,163,184,.14)",
    borderRadius: "12px",
    background: "linear-gradient(160deg, rgba(255,255,255,.98), rgba(248,250,252,.96))",
    color: "#0f172a",
    font: "13px 'Geist', Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    boxShadow: "0 20px 46px rgba(15,23,42,.12)",
    backdropFilter: "blur(6px)",
    display: "none",
    overflowY: "auto",
    maxHeight: "calc(100vh - 32px)"
  });
  document.body.appendChild(tooltip);
  return tooltip;
}

function hideTooltip() {
  ensureTooltip().style.display = "none";
}

function togglePanel() {
  const panel = ensureTooltip();
  if (panel.style.display === "block") {
    panel.style.display = "none";
  } else {
    panel.style.display = "block";
    positionTooltip();
    // Refresh scan when opening the panel
    void scanDraft();
  }
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
      if (rect.width > 0 || rect.height > 0) return rect;
    }
    node = walker.nextNode();
  }
  return null;
}

function updateHighlights() {
  if (!('highlights' in CSS)) return;
  
  const compose = getCompose();
  if (!compose || !latestReport || !latestReport.violations.length) {
    CSS.highlights.delete('complylens-violations');
    return;
  }

  const ranges: Range[] = [];
  // Only highlight the top (first) violation to present a single suggested rewrite
  const top = latestReport.violations[0];
  if (top && !isSubjectViolation(top) && top.quote.trim()) {
    const quote = top.quote.trim();
    const walker = document.createTreeWalker(compose, NodeFilter.SHOW_TEXT);
    let node: Node | null = walker.nextNode();
    while (node) {
      const text = node.textContent ?? "";
      const start = text.indexOf(quote);
      if (start >= 0) {
        const range = new Range();
        range.setStart(node, start);
        range.setEnd(node, start + quote.length);
        ranges.push(range);
      }
      node = walker.nextNode();
    }
  }

  if (ranges.length > 0) {
    const highlight = new Highlight(...ranges);
    CSS.highlights.set('complylens-violations', highlight);
  } else {
    CSS.highlights.delete('complylens-violations');
  }
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

  if (ensureTooltip().style.display === "block") {
    positionTooltip();
  }
}

function positionTooltip(_quote?: string, _source: "Subject" | "Body" = "Body") {
  const panel = ensureTooltip();
  const anchor = getComposeAnchor();
  if (!anchor) return;

  const rect = anchor.getBoundingClientRect();
  const rightSpace = Math.max(0, window.innerWidth - rect.right - PANEL_GAP);
  const leftSpace = Math.max(0, rect.left - PANEL_GAP);

  const rightFits = rightSpace >= PANEL_MIN_WIDTH;
  const leftFits = leftSpace >= PANEL_MIN_WIDTH;
  let side: "left" | "right" = "right";

  if (rightFits && !leftFits) {
    side = "right";
  } else if (leftFits && !rightFits) {
    side = "left";
  } else {
    side = rightSpace >= leftSpace ? "right" : "left";
  }

  const available = side === "right" ? rightSpace : leftSpace;
  const width = Math.min(PANEL_MAX_WIDTH, available);

  if (width < 160) {
    panel.style.display = "none";
    return;
  }

  panel.style.width = `${width}px`;
  panel.style.right = "auto";

  const left = side === "right"
    ? rect.right + PANEL_GAP
    : rect.left - PANEL_GAP - width;

  panel.style.left = `${Math.max(8, left)}px`;

  const top = Math.max(16, rect.top);
  const height = Math.max(PANEL_MIN_HEIGHT, window.innerHeight - top - PANEL_GAP);
  panel.style.top = `${top}px`;
  panel.style.height = `${height}px`;
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
  const fullPolicyString = violation.violatedPolicy || `${violation.policyName} - ${violation.policySection}`;
  const policyText = createElement("span", { text: `${fullPolicyString} | ${source}` });
  policyRef.append(policyTitle, policyText);

  const why = createElement("div");
  setStyles(why, { padding: "10px", borderRadius: "14px", background: "rgba(248,250,252,.96)" });
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
  apply.addEventListener("click", () => void applyViolationRewrite(violation));

  const rescan = actionButton("Rescan");
  rescan.addEventListener("click", () => void scanDraft());

  const dismiss = actionButton("Hide");
  dismiss.addEventListener("click", () => hideTooltip());

  actions.append(apply, rescan, dismiss);
  wrap.append(policyRef, why, rewrite, actions);
  return wrap;
}

function renderTooltip(state: "ready" | "loading" | "error", message = "") {
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
  const subjectLine = createElement("div", { text: `Subject: ${latestSubject || "No subject yet"}` });
  setStyles(subjectLine, { fontWeight: "700", color: "#1f2937" });
  const bodyMeta = createElement("div", { text: `Body: ${latestBody ? `${latestBody.split(/\s+/).filter(Boolean).length} words` : "empty"}` });
  setStyles(bodyMeta, { color: "#64748b" });
  meta.append(subjectLine, bodyMeta);
  tooltip.append(meta);

  if (state === "loading") {
    const loading = createElement("p", { text: "Scanning this draft..." });
    setStyles(loading, { margin: "0", color: "#64748b", lineHeight: "1.5" });
    tooltip.append(loading);
    tooltip.style.display = "block";
    positionTooltip();
    ensureTooltip().scrollTop = 0;
    return;
  }

  if (state === "error") {
    const error = createElement("p", { text: message });
    setStyles(error, { margin: "0", color: "#991b1b", lineHeight: "1.5" });
    tooltip.append(error);
    tooltip.style.display = "block";
    positionTooltip();
    ensureTooltip().scrollTop = 0;
    return;
  }

  if (!latestReport?.violations.length) {
    const ok = createElement("p", { text: latestReport?.summary ?? "No policy issues found." });
    setStyles(ok, { margin: "0", color: "#047857", lineHeight: "1.5" });
    tooltip.append(ok);
    tooltip.style.display = "block";
    positionTooltip();
    ensureTooltip().scrollTop = 0;
    return;
  }

  const cardsContainer = createElement("div");
  setStyles(cardsContainer, {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    maxHeight: "360px",
    overflowY: "auto",
    paddingRight: "4px"
  });

  // Render only the top (first) violation so a single rewrite is suggested
  const topViolation = latestReport.violations[0];
  if (topViolation) cardsContainer.append(violationCard(topViolation));
  
  tooltip.append(cardsContainer);
  tooltip.style.display = "block";
  positionTooltip(latestReport.violations[0]?.quote, isSubjectViolation(latestReport.violations[0]) ? "Subject" : "Body");
  ensureTooltip().scrollTop = 0;
}

async function applyViolationRewrite(violation: Violation) {
  if (!violation) return;
  const quote = violation.quote.trim();
  const rewrite = violation.rewrite.trim();
  if (!quote || !rewrite) return;
  
  const appliesToSubject = isSubjectViolation(violation);

  try {
    let success = false;
    
    if (appliesToSubject) {
      const nextText = applyRewrite(latestSubject, violation);
      if (nextText !== latestSubject) {
        success = setSubjectText(nextText);
      }
    } else {
      success = replaceQuoteInCompose(quote, rewrite);
      if (!success) {
        const nextText = applyRewrite(latestBody, violation);
        if (nextText !== latestBody) {
          success = setComposeText(nextText);
        }
      }
    }

    if (!success) {
      renderTooltip("error", "Could not locate the exact quote in the draft to apply the rewrite.");
      return;
    }

    const snapshot = getDraftSnapshot();
    setLatestSnapshot(snapshot);
    try {
      latestReport = await analyzeDraft(snapshot.combined);
      updateHighlights();
    } catch {
      latestReport = null;
      updateHighlights();
    }

    lastScanAt = Date.now();
    renderTooltip("ready");
  } catch (error) {
    renderTooltip("error", `Rewrite unavailable. ${error instanceof Error ? error.message.slice(0, 120) : ""}`);
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
    updateHighlights();
    lastScanAt = Date.now();
    renderTooltip("ready");
  } catch (error) {
    latestReport = null;
    updateHighlights();
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

function getComposeState() {
  return getCurrentState();
}
