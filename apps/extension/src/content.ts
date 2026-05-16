import { analyzeCompliance } from "./analysisService";
import { defaultSettings, loadSettings, subscribeToSettings } from "./settings";
import type { ComplianceAnalysis, ComplianceFinding, ExtensionSettings } from "./types";

const ROOT_CLASS = "complylens-extension-root";
const HIGHLIGHT_CLASS = "complylens-risk-highlight";
const SEND_GUARD_CLASS = "complylens-send-guard";

type ComposeSession = {
  id: string;
  dialog: HTMLElement;
  editor: HTMLElement;
  button: HTMLButtonElement;
  panel: HTMLElement;
  modal: HTMLElement;
  analysis: ComplianceAnalysis | null;
  lastText: string;
  scanTimer: number;
  allowNextSend: boolean;
};

let settings: ExtensionSettings = defaultSettings;
const sessions = new Map<HTMLElement, ComposeSession>();

void initialize();

async function initialize() {
  settings = await loadSettings();
  installStyles();
  scanComposes();
  installSendInterceptor();
  subscribeToSettings((nextSettings) => {
    settings = nextSettings;
    sessions.forEach((session) => {
      session.button.hidden = !settings.enabled;
      if (!settings.enabled) {
        hidePanel(session);
        removeHighlights(session);
      }
    });
  });

  const observer = new MutationObserver(() => scanComposes());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("resize", () => sessions.forEach(positionSessionUi));
  window.addEventListener("scroll", () => sessions.forEach(positionSessionUi), true);
  document.addEventListener("input", handleEditorInput, true);
}

function scanComposes() {
  if (!settings.enabled) return;
  const editors = findComposeEditors();
  editors.forEach((editor) => {
    if (sessions.has(editor)) return;
    const dialog = findComposeDialog(editor);
    const session = createSession(editor, dialog);
    sessions.set(editor, session);
    positionSessionUi(session);
    if (settings.autoScan && getEditorText(editor).trim()) {
      scheduleScan(session, 600);
    }
  });

  sessions.forEach((session, editor) => {
    if (!document.contains(editor)) {
      session.button.remove();
      session.panel.remove();
      session.modal.remove();
      sessions.delete(editor);
    }
  });
}

function findComposeEditors() {
  return Array.from(document.querySelectorAll<HTMLElement>('[contenteditable="true"][role="textbox"]'))
    .filter((element) => {
      const label = `${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("aria-multiline") ?? ""}`.toLowerCase();
      const textRole = element.getAttribute("role") === "textbox";
      const visible = element.offsetWidth > 120 && element.offsetHeight > 40;
      const insideGmailDialog = Boolean(element.closest('[role="dialog"], [aria-label*="Message"], [aria-label*="New Message"]'));
      return textRole && visible && insideGmailDialog && (label.includes("message") || label.includes("body") || element.closest('[role="dialog"]'));
    });
}

function findComposeDialog(editor: HTMLElement): HTMLElement {
  // Try progressively wider Gmail compose container selectors
  const selectors = [
    '[role="dialog"]',
    '.nH.Hd[class]',   // Gmail compose window wrapper
    '.aaZ',            // Gmail compose outer shell
    '.AD',             // Gmail compose window in some versions
    '.M9',             // Another Gmail compose class
  ];
  for (const sel of selectors) {
    const el = editor.closest<HTMLElement>(sel);
    if (el && el.offsetWidth > 200 && el.offsetHeight > 200) return el;
  }
  // Walk up to find the largest ancestor that looks like the compose window
  let el: HTMLElement | null = editor.parentElement;
  let best: HTMLElement = editor;
  let depth = 0;
  while (el && depth < 12) {
    if (el.offsetWidth > 300 && el.offsetHeight > 300 && el.offsetWidth < window.innerWidth * 0.8) {
      best = el;
    }
    el = el.parentElement;
    depth++;
  }
  return best;
}


function createSession(editor: HTMLElement, dialog: HTMLElement): ComposeSession {
  const id = `complylens-${crypto.randomUUID()}`;
  const button = document.createElement("button");
  button.className = `${ROOT_CLASS} complylens-check-button`;
  button.type = "button";
  button.title = "ComplyLens — Check Compliance";
  button.setAttribute("aria-label", "ComplyLens - Check Compliance");
  button.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
  button.addEventListener("click", () => {
    if (session.panel.hidden) {
      void runScan(session);
    } else {
      hidePanel(session);
    }
  });

  const panel = document.createElement("aside");
  panel.className = `${ROOT_CLASS} complylens-panel`;
  panel.hidden = true;

  const modal = document.createElement("section");
  modal.className = `${ROOT_CLASS} complylens-modal`;
  modal.hidden = true;

  const session: ComposeSession = {
    id,
    dialog,
    editor,
    button,
    panel,
    modal,
    analysis: null,
    lastText: "",
    scanTimer: 0,
    allowNextSend: false
  };

  document.body.append(button, panel, modal);
  return session;
}

function positionSessionUi(session: ComposeSession) {
  const dialogRect = session.dialog.getBoundingClientRect();

  // ── Shield button: bottom-right corner of the compose window toolbar area
  const btnSize = 32;
  Object.assign(session.button.style, {
    left:   `${Math.max(0, dialogRect.right - btnSize - 12)}px`,
    top:    `${Math.max(0, dialogRect.bottom - btnSize - 12)}px`,
    width:  `${btnSize}px`,
    height: `${btnSize}px`
  });

  // ── Panel: always opens ABOVE the compose window, aligned to its right edge.
  //    This avoids any overlap with the compose content regardless of viewport width.
  const panelWidth = Math.min(360, window.innerWidth - 28);

  // Space above the compose window
  const spaceAbove = dialogRect.top - 16;
  // Space to the left of the compose window  
  const spaceLeft = dialogRect.left - 16;

  if (spaceLeft >= panelWidth + 8) {
    // ── Prefer: open to the LEFT of the compose window
    const panelRight = window.innerWidth - dialogRect.left + 8;
    const panelTop   = Math.max(10, dialogRect.top);
    const panelMaxH  = Math.min(560, window.innerHeight - panelTop - 20);
    Object.assign(session.panel.style, {
      right:     `${panelRight}px`,
      left:      "auto",
      top:       `${panelTop}px`,
      bottom:    "auto",
      width:     `${panelWidth}px`,
      maxHeight: `${panelMaxH}px`
    });
  } else if (spaceAbove >= 200) {
    // ── Fallback: open ABOVE the compose window, right-aligned to it
    const panelRight  = Math.max(10, window.innerWidth - dialogRect.right);
    const panelBottom = window.innerHeight - dialogRect.top + 8;
    const panelMaxH   = Math.min(560, spaceAbove - 16);
    Object.assign(session.panel.style, {
      right:     `${panelRight}px`,
      left:      "auto",
      top:       "auto",
      bottom:    `${panelBottom}px`,
      width:     `${panelWidth}px`,
      maxHeight: `${panelMaxH}px`
    });
  } else {
    // ── Last resort: fixed center-left overlay that doesn't cover compose
    Object.assign(session.panel.style, {
      left:      "16px",
      right:     "auto",
      top:       "80px",
      bottom:    "auto",
      width:     `${panelWidth}px`,
      maxHeight: "560px"
    });
  }
}


async function runScan(session: ComposeSession) {
  const text = getEditorText(session.editor);
  session.lastText = text;
  showPanel(session, "loading");

  if (!settings.enabled) {
    showPanel(session, "error", "ComplyLens is disabled in extension settings.");
    return;
  }
  if (!text.trim()) {
    showPanel(session, "error", "Write or paste draft text before scanning.");
    return;
  }

  try {
    session.analysis = await analyzeCompliance(text, settings);
    renderPanel(session);
    highlightFindings(session);
  } catch (error) {
    showPanel(session, "error", `Analysis failed. ${error instanceof Error ? error.message.slice(0, 120) : ""}`);
  }
}

function showPanel(session: ComposeSession, state: "loading" | "error", message = "") {
  session.panel.hidden = false;
  session.panel.innerHTML = `
    <div class="cl-panel-head">
      <div class="cl-brand">
        <div class="cl-brand-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
        <div><strong>ComplyLens</strong><span>Gmail compliance copilot</span></div>
      </div>
      <button class="cl-icon-button" data-close-panel><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="cl-state ${state}">
      <strong>${state === "loading" ? "Scanning draft..." : "Unable to scan"}</strong>
      <span>${message || "Checking policy risks, rewrites, and citations locally."}</span>
    </div>
  `;
  bindPanelActions(session);
  positionSessionUi(session);
}

function renderPanel(session: ComposeSession) {
  const analysis = session.analysis;
  if (!analysis) return;
  const findings = analysis.findings;
  const firstFinding = findings[0];

  session.panel.hidden = false;
  session.panel.innerHTML = `
    <div class="cl-panel-head">
      <div class="cl-brand">
        <div class="cl-brand-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
        <div><strong>ComplyLens</strong><span>Gmail compliance copilot</span></div>
      </div>
      <button class="cl-icon-button" data-close-panel><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="cl-score-card ${analysis.riskLevel === "High risk" ? "critical" : analysis.riskLevel === "Needs review" ? "warning" : "success"}">
      <div><span>${analysis.score}%</span><small>Compliance Score</small></div>
      <div><strong>${analysis.riskLevel}</strong><p>${analysis.summary}</p></div>
    </div>
    <div class="cl-section-title">
      <span>${findings.length} violation${findings.length === 1 ? "" : "s"} found</span>
      <button data-rescan>Re-scan</button>
    </div>
    <div class="cl-findings">
      ${findings.length ? findings.map(renderFinding).join("") : `<div class="cl-clean">No risky language found. This draft is ready for normal review.</div>`}
    </div>
    ${firstFinding ? `<button class="cl-apply-all" data-apply-all>Apply Safe Rewrites</button>` : ""}
  `;
  bindPanelActions(session);
  positionSessionUi(session);
}

function renderFinding(finding: ComplianceFinding) {
  return `
    <article class="cl-finding ${finding.severity}" data-finding-id="${finding.id}">
      <div class="cl-finding-top">
        <strong>${escapeHtml(finding.severity)} risk</strong>
        <span>${Math.round(finding.confidence * 100)}% confidence</span>
      </div>
      <blockquote>${escapeHtml(finding.matchedText)}</blockquote>
      <div class="cl-policy"><b>Policy reference</b><span>${escapeHtml(finding.policyCitation)}</span></div>
      <p>${escapeHtml(finding.explanation)}</p>
      <div class="cl-rewrite"><b>Suggested rewrite</b><span>${escapeHtml(finding.suggestedRewrite)}</span></div>
      <button data-apply-rewrite="${finding.id}">Apply Rewrite</button>
    </article>
  `;
}

function bindPanelActions(session: ComposeSession) {
  session.panel.querySelector("[data-close-panel]")?.addEventListener("click", () => hidePanel(session));
  session.panel.querySelector("[data-rescan]")?.addEventListener("click", () => void runScan(session));
  session.panel.querySelector("[data-apply-all]")?.addEventListener("click", () => applyAllRewrites(session));
  session.panel.querySelectorAll<HTMLElement>("[data-apply-rewrite]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.applyRewrite;
      const finding = session.analysis?.findings.find((item) => item.id === id);
      if (finding) applyRewrite(session, finding);
    });
  });
}

function hidePanel(session: ComposeSession) {
  session.panel.hidden = true;
}

function handleEditorInput(event: Event) {
  const editor = (event.target as HTMLElement | null)?.closest?.('[contenteditable="true"][role="textbox"]') as HTMLElement | null;
  if (!editor) return;
  const session = sessions.get(editor);
  if (!session) return;
  removeHighlights(session);
  if (settings.autoScan) scheduleScan(session, 900);
}

function scheduleScan(session: ComposeSession, delay: number) {
  window.clearTimeout(session.scanTimer);
  session.scanTimer = window.setTimeout(() => {
    if (getEditorText(session.editor) !== session.lastText) void runScan(session);
  }, delay);
}

function highlightFindings(session: ComposeSession) {
  removeHighlights(session);
  const findings = session.analysis?.findings ?? [];
  findings.forEach((finding) => highlightText(session.editor, finding));
}

function highlightText(root: HTMLElement, finding: ComplianceFinding) {
  const quote = finding.matchedText.trim();
  if (!quote) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.closest(`.${HIGHLIGHT_CLASS}`)) return NodeFilter.FILTER_REJECT;
      return (node.textContent ?? "").includes(quote) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });
  const node = walker.nextNode();
  if (!node?.textContent) return;
  const index = node.textContent.indexOf(quote);
  if (index < 0) return;
  const range = document.createRange();
  range.setStart(node, index);
  range.setEnd(node, index + quote.length);
  const span = document.createElement("span");
  span.className = `${HIGHLIGHT_CLASS} severity-${finding.severity}`;
  span.title = `${finding.policyCitation} - ${Math.round(finding.confidence * 100)}% confidence`;
  try {
    range.surroundContents(span);
  } catch {
    // Gmail compose DOM can split text across inline elements. In that case we skip inline highlighting rather than risk breaking typing.
  }
}

function removeHighlights(session: ComposeSession) {
  session.editor.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((highlight) => {
    const parent = highlight.parentNode;
    if (!parent) return;
    while (highlight.firstChild) parent.insertBefore(highlight.firstChild, highlight);
    highlight.remove();
    parent.normalize();
  });
}

function applyRewrite(session: ComposeSession, finding: ComplianceFinding) {
  removeHighlights(session);
  const current = getEditorText(session.editor);
  if (!current.includes(finding.matchedText)) {
    showPanel(session, "error", "Could not find the risky text in the current draft. Re-scan and try again.");
    return;
  }
  setEditorText(session.editor, current.replace(finding.matchedText, finding.suggestedRewrite));
  void runScan(session);
}

function applyAllRewrites(session: ComposeSession) {
  let nextText = getEditorText(session.editor);
  for (const finding of session.analysis?.findings ?? []) {
    nextText = nextText.replace(finding.matchedText, finding.suggestedRewrite);
  }
  removeHighlights(session);
  setEditorText(session.editor, nextText);
  void runScan(session);
}

function installSendInterceptor() {
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const sendButton = target?.closest<HTMLElement>('[role="button"], div[aria-label], button');
    if (!sendButton || !isSendButton(sendButton)) return;
    const session = findSessionForSend(sendButton);
    if (!session || session.allowNextSend) {
      if (session) session.allowNextSend = false;
      return;
    }
    const highRisk = session.analysis?.findings.filter((finding) => finding.severity === "high" || finding.severity === "critical") ?? [];
    if (!highRisk.length) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    showSendGuard(session, highRisk.length, sendButton);
  }, true);
}

function isSendButton(element: HTMLElement) {
  const label = `${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("data-tooltip") ?? ""} ${element.textContent ?? ""}`.trim().toLowerCase();
  return /^send(\s|$)/.test(label) || label.includes("send ‪") || label.includes("send (");
}

function findSessionForSend(sendButton: HTMLElement) {
  const dialog = sendButton.closest<HTMLElement>('[role="dialog"]');
  if (!dialog) return Array.from(sessions.values()).find((session) => document.contains(session.editor)) ?? null;
  return Array.from(sessions.values()).find((session) => session.dialog === dialog || session.dialog.contains(sendButton)) ?? null;
}

function showSendGuard(session: ComposeSession, count: number, sendButton: HTMLElement) {
  session.modal.hidden = false;
  session.modal.innerHTML = `
    <div class="cl-modal-card">
      <strong>${count} policy risk${count === 1 ? "" : "s"} detected before sending</strong>
      <p>ComplyLens found high-risk language in this Gmail draft. Review or apply rewrites before sending externally.</p>
      <div>
        <button data-review-issues>Review Issues</button>
        <button data-apply-safe>Apply Safe Rewrites</button>
        <button data-send-anyway>Send Anyway</button>
      </div>
    </div>
  `;
  session.modal.querySelector("[data-review-issues]")?.addEventListener("click", () => {
    session.modal.hidden = true;
    renderPanel(session);
  });
  session.modal.querySelector("[data-apply-safe]")?.addEventListener("click", () => {
    session.modal.hidden = true;
    applyAllRewrites(session);
  });
  session.modal.querySelector("[data-send-anyway]")?.addEventListener("click", () => {
    session.modal.hidden = true;
    session.allowNextSend = true;
    sendButton.click();
  });
}

function getEditorText(editor: HTMLElement) {
  return editor.innerText ?? "";
}

function setEditorText(editor: HTMLElement, text: string) {
  editor.focus();
  editor.innerText = text;
  editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char] ?? char));
}

function installStyles() {
  if (document.getElementById("complylens-extension-styles")) return;
  const style = document.createElement("style");
  style.id = "complylens-extension-styles";
  style.textContent = `
    .${ROOT_CLASS} { box-sizing: border-box; font-family: "Geist", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .complylens-check-button {
      position: fixed; z-index: 2147483645; border: 1.5px solid rgba(255,255,255,.4);
      border-radius: 50%; color: #fff; background: linear-gradient(135deg,#4f46e5,#6d5dfc);
      box-shadow: 0 4px 16px rgba(79,70,229,.38), 0 0 0 2px rgba(79,70,229,.16); cursor: pointer; display: grid; place-items: center;
      transition: transform .18s ease, box-shadow .18s ease;
    }
    .complylens-check-button:hover { transform: scale(1.1); box-shadow: 0 6px 22px rgba(79,70,229,.48), 0 0 0 3px rgba(79,70,229,.2); }
    .complylens-panel {
      position: fixed; z-index: 2147483646; max-height: min(600px, calc(100vh - 36px)); overflow-y: auto; overflow-x: hidden;
      padding: 16px; border: 1px solid rgba(148,163,184,.18); border-radius: 24px; color: #0f172a;
      background: rgba(255,255,255,.97); box-shadow: 0 24px 70px rgba(15,23,42,.12); backdrop-filter: blur(18px);
    }
    .cl-panel-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 16px; }
    .cl-brand { display: flex; align-items: center; gap: 10px; }
    .cl-brand-icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 10px; color: #fff; background: linear-gradient(135deg,#4f46e5,#6d5dfc); box-shadow: 0 6px 14px rgba(79,70,229,.22); flex-shrink: 0; }
    .cl-panel-head strong, .cl-panel-head span { display: block; }
    .cl-panel-head strong { font-size: 16px; letter-spacing: -0.015em; }
    .cl-panel-head span, .cl-state span, .cl-score-card p, .cl-finding p, .cl-policy span, .cl-rewrite span { color: #64748b; line-height: 1.5; font-size: 13px; }
    .cl-icon-button { width: 30px; height: 30px; border: 1px solid rgba(148,163,184,.22); border-radius: 50%; background: rgba(248,250,252,.9); color: #64748b; cursor: pointer; display: grid; place-items: center; }
    .cl-state, .cl-clean { padding: 14px; border-radius: 16px; background: rgba(248,250,252,.84); border: 1px solid rgba(148,163,184,.12); }
    .cl-state.error { color: #b91c1c; background: rgba(254,242,242,.86); border-color: rgba(239,68,68,.18); }
    .cl-score-card { display: grid; grid-template-columns: 70px minmax(0,1fr); gap: 14px; padding: 14px; border-radius: 20px; background: rgba(248,250,252,.9); border: 1px solid rgba(148,163,184,.18); }
    .cl-score-card div:first-child { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; background: #fff; box-shadow: inset 0 0 0 6px rgba(79,70,229,.14); }
    .cl-score-card.warning div:first-child { box-shadow: inset 0 0 0 6px rgba(245,158,11,.22); }
    .cl-score-card.critical div:first-child { box-shadow: inset 0 0 0 6px rgba(239,68,68,.2); }
    .cl-score-card span { font-size: 16px; font-weight: 800; }
    .cl-score-card small { color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    .cl-score-card strong { display: block; margin-top: 4px; font-size: 16px; letter-spacing: -0.01em; }
    .cl-section-title { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 16px 0 12px; color: #475569; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    .cl-section-title button, .cl-finding button, .cl-apply-all, .cl-modal-card button {
      min-height: 34px; padding: 0 14px; border: 1px solid rgba(79,70,229,.18); border-radius: 999px; background: rgba(238,242,255,.86); color: #4f46e5; font-weight: 700; font-size: 13px; cursor: pointer; transition: all 0.15s ease;
    }
    .cl-section-title button:hover, .cl-finding button:hover, .cl-modal-card button:hover { background: rgba(224,231,255,.9); transform: translateY(-1px); }
    .cl-findings { display: grid; gap: 12px; }
    .cl-finding { display: grid; gap: 10px; padding: 14px; border: 1px solid rgba(148,163,184,.2); border-radius: 20px; background: rgba(255,255,255,.8); box-shadow: 0 8px 24px rgba(15,23,42,.03); }
    .cl-finding.high, .cl-finding.critical { border-color: rgba(239,68,68,.26); }
    .cl-finding.medium { border-color: rgba(245,158,11,.28); }
    .cl-finding-top { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
    .cl-finding-top strong { text-transform: capitalize; font-size: 14px; }
    .cl-finding-top span { color: #64748b; font-size: 12px; font-weight: 700; }
    .cl-finding blockquote { margin: 0; padding: 10px 12px; border-radius: 12px; background: rgba(255,251,235,.9); color: #92400e; font-size: 14px; line-height: 1.5; border-left: 3px solid #f59e0b; }
    .cl-finding.high blockquote, .cl-finding.critical blockquote { background: rgba(254,242,242,.9); color: #991b1b; border-left-color: #ef4444; }
    .cl-policy, .cl-rewrite { display: grid; gap: 4px; padding: 12px; border-radius: 14px; background: rgba(248,250,252,.9); font-size: 13px; border: 1px solid rgba(148,163,184,.1); }
    .cl-rewrite { background: rgba(236,253,245,.9); border-color: rgba(16,185,129,.15); }
    .cl-rewrite b, .cl-rewrite span { color: #047857; }
    .cl-apply-all { width: 100%; margin-top: 14px; color: #fff; background: linear-gradient(135deg,#4f46e5,#6d5dfc); border: 1px solid rgba(79,70,229,.26); box-shadow: 0 12px 24px rgba(79,70,229,.18); }
    .cl-apply-all:hover { box-shadow: 0 16px 32px rgba(79,70,229,.25); transform: translateY(-1px); }
    .${HIGHLIGHT_CLASS} { text-decoration: underline; text-decoration-style: wavy; text-decoration-color: #f59e0b; text-decoration-thickness: 2px; text-underline-offset: 3px; border-radius: 3px; background: rgba(245,158,11,.1); }
    .${HIGHLIGHT_CLASS}.severity-critical, .${HIGHLIGHT_CLASS}.severity-high { text-decoration-color: #ef4444; background: rgba(239,68,68,.08); }
    .complylens-modal { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; background: rgba(15,23,42,.3); backdrop-filter: blur(6px); }
    .complylens-modal[hidden], .complylens-panel[hidden] { display: none; }
    .cl-modal-card { width: min(430px, calc(100vw - 32px)); padding: 24px; border: 1px solid rgba(255,255,255,.8); border-radius: 28px; background: rgba(255,255,255,.96); box-shadow: 0 34px 90px rgba(15,23,42,.24); text-align: center; }
    .cl-modal-card strong { display: block; font-size: 20px; letter-spacing: -0.02em; margin-bottom: 10px; }
    .cl-modal-card p { color: #64748b; line-height: 1.6; font-size: 14px; margin-bottom: 24px; }
    .cl-modal-card div { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
    .cl-modal-card button[data-send-anyway] { background: transparent; border-color: rgba(148,163,184,.3); color: #64748b; }
    .cl-modal-card button[data-send-anyway]:hover { background: rgba(241,245,249,.8); }
  `;
  document.documentElement.appendChild(style);
}
