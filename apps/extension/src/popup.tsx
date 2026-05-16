import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, GripVertical, KeyRound, Maximize2, MailCheck, RefreshCw, Shield, Wand2 } from "lucide-react";
import type { ComplianceReport, Violation } from "@complylens/shared";
import "./popup.css";

type DraftSnapshot = {
  subject: string;
  body: string;
  combined: string;
};

type LiveState = {
  snapshot: DraftSnapshot;
  report: ComplianceReport | null;
};

type PanelBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const DEFAULT_BOUNDS: PanelBounds = {
  x: 0,
  y: 0,
  width: 390,
  height: 648,
};

const MIN_WIDTH = 340;
const MIN_HEIGHT = 560;

function Popup() {
  const [snapshot, setSnapshot] = useState<DraftSnapshot>({ subject: "", body: "", combined: "" });
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("http://127.0.0.1:8000");
  const [connected, setConnected] = useState(false);
  const [bounds, setBounds] = useState<PanelBounds>(DEFAULT_BOUNDS);

  const dragState = React.useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const resizeState = React.useRef<{ startX: number; startY: number; originWidth: number; originHeight: number } | null>(null);

  const firstViolation: Violation | undefined = report?.violations[0];

  useEffect(() => {
    chrome.storage?.sync?.get(["complylensApiBaseUrl"], (result) => {
      if (result.complylensApiBaseUrl) setApiBaseUrl(result.complylensApiBaseUrl);
    });
    chrome.storage?.local?.get(["complylens-popup-bounds"], (result) => {
      const next = result["complylens-popup-bounds"] as PanelBounds | undefined;
      if (next && Number.isFinite(next.width) && Number.isFinite(next.height)) {
        setBounds({
          x: Number.isFinite(next.x) ? next.x : DEFAULT_BOUNDS.x,
          y: Number.isFinite(next.y) ? next.y : DEFAULT_BOUNDS.y,
          width: Math.max(MIN_WIDTH, next.width),
          height: Math.max(MIN_HEIGHT, next.height),
        });
      }
    });
    void syncFromGmail(true);
  }, []);

  useEffect(() => {
    chrome.storage?.local?.set({ "complylens-popup-bounds": bounds });
  }, [bounds]);

  async function getActiveTabId() {
    const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve);
    });
    return tabs[0]?.id ?? null;
  }

  async function sendTabMessage<T>(message: Record<string, unknown>) {
    const tabId = await getActiveTabId();
    if (tabId == null) {
      throw new Error("Open Gmail first to read the live draft.");
    }

    return new Promise<T>((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        if (!response) {
          reject(new Error("No response from Gmail compose listener."));
          return;
        }
        resolve(response as T);
      });
    });
  }

  async function syncFromGmail(scan = false) {
    setLoading(true);
    setNotice("");
    try {
      const response = await sendTabMessage<LiveState>(scan ? { type: "scanCurrentDraft" } : { type: "getSnapshot" });
      setSnapshot(response.snapshot);
      setReport(response.report);
      setNotice(response.snapshot.combined ? "Synced live Gmail draft." : "Open a Gmail compose window to load a draft.");
    } catch (error) {
      setSnapshot({ subject: "", body: "", combined: "" });
      setReport(null);
      setNotice(`Could not read Gmail draft. ${error instanceof Error ? error.message.slice(0, 80) : ""}`);
    } finally {
      setLoading(false);
    }
  }

  function saveApiBaseUrl(nextUrl = apiBaseUrl) {
    chrome.storage?.sync?.set({ complylensApiBaseUrl: nextUrl });
    setNotice("Extension backend URL saved.");
  }

  async function testConnection() {
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      if (!response.ok) throw new Error(await response.text());
      setConnected(true);
      saveApiBaseUrl(apiBaseUrl);
      setNotice("Connected to ComplyLens backend.");
    } catch (error) {
      setConnected(false);
      setNotice(`Could not connect to backend. ${error instanceof Error ? error.message.slice(0, 80) : ""}`);
    } finally {
      setLoading(false);
    }
  }

  async function applyRewriteInGmail() {
    if (!firstViolation) return;
    setLoading(true);
    setNotice("");
    try {
      await sendTabMessage<{ ok: boolean }>({ type: "applyCurrentRewrite" });
      await syncFromGmail(true);
      setNotice("Suggested rewrite applied in Gmail.");
    } catch (error) {
      setNotice(`Could not apply rewrite. ${error instanceof Error ? error.message.slice(0, 80) : ""}`);
    } finally {
      setLoading(false);
    }
  }

  function beginDrag(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    const target = event.currentTarget.getBoundingClientRect();
    dragState.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: bounds.x,
      originY: bounds.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      if (!dragState.current) return;
      const deltaX = moveEvent.clientX - dragState.current.startX;
      const deltaY = moveEvent.clientY - dragState.current.startY;
      setBounds((current) => ({ ...current, x: dragState.current!.originX + deltaX, y: dragState.current!.originY + deltaY }));
    };

    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function beginResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    resizeState.current = {
      startX: event.clientX,
      startY: event.clientY,
      originWidth: bounds.width,
      originHeight: bounds.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      if (!resizeState.current) return;
      const deltaX = moveEvent.clientX - resizeState.current.startX;
      const deltaY = moveEvent.clientY - resizeState.current.startY;
      setBounds((current) => ({
        ...current,
        width: Math.max(MIN_WIDTH, resizeState.current!.originWidth + deltaX),
        height: Math.max(MIN_HEIGHT, resizeState.current!.originHeight + deltaY),
      }));
    };

    const onUp = () => {
      resizeState.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function resetBounds() {
    setBounds(DEFAULT_BOUNDS);
  }

  return (
    <main
      className="popup-shell"
      style={{
        width: bounds.width,
        height: bounds.height,
        transform: `translate(${bounds.x}px, ${bounds.y}px)`,
      }}
    >
      <header onPointerDown={beginDrag}>
        <div className="mark">
          <Shield size={18} />
        </div>
        <div>
          <h1>ComplyLens</h1>
          <p>Live Gmail compliance check</p>
        </div>
        <div className="popup-header-actions">
          <button aria-label="Reset popup size" className="popup-icon-button" onClick={resetBounds} type="button">
            <Maximize2 size={14} />
          </button>
          <span className="popup-drag-hint"><GripVertical size={14} /></span>
        </div>
      </header>

      <section className="risk-meter">
        <div className="risk-score">
          <span>{report ? `${report.score}%` : "--"}</span>
        </div>
        <div>
          <span>Risk Score</span>
          <strong>{report ? (report.status === "blocked" ? "Needs review" : "Ready") : "Waiting for Gmail"}</strong>
          <p>{report ? `${report.flaggedSections} policy risks detected.` : "Open a Gmail draft and refresh to load the live compose text."}</p>
        </div>
      </section>

      <section className="extension-config">
        <label>
          <span><KeyRound size={14} /> Backend URL</span>
          <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} />
        </label>
        <button className={connected ? "config-button connected" : "config-button"} disabled={loading} onClick={() => void testConnection()} type="button">
          {connected ? "Connected" : "Test"}
        </button>
      </section>

      <section className="popup-live-draft">
        <div className="popup-live-draft__head">
          <strong>Live Gmail draft</strong>
          <button className="config-button" disabled={loading} onClick={() => void syncFromGmail(true)} type="button">
            {loading ? "Loading..." : "Refresh from Gmail"}
          </button>
        </div>
        <div className="popup-live-draft__field">
          <span>Subject</span>
          <p>{snapshot.subject || "No subject detected"}</p>
        </div>
        <div className="popup-live-draft__field">
          <span>Body</span>
          <p>{snapshot.body || "No Gmail compose body detected yet."}</p>
        </div>
      </section>

      {notice && <div className="popup-notice">{notice}</div>}

      {firstViolation ? (
        <motion.section animate={{ opacity: 1, y: 0 }} className="flag" initial={{ opacity: 0, y: 6 }}>
          <div className="flag-title">
            <AlertTriangle size={16} />
            <strong>{firstViolation.policySection}</strong>
          </div>
          <p>{firstViolation.explanation}</p>
          <div className="rewrite">
            <Wand2 size={15} />
            <span>{firstViolation.rewrite}</span>
          </div>
          <button disabled={loading} onClick={() => void applyRewriteInGmail()} type="button">Apply rewrite in Gmail</button>
        </motion.section>
      ) : (
        <section className="clean">
          <CheckCircle2 size={18} />
          <span>{report ? "No violations found in the live Gmail draft." : "Open Gmail and compose a message to start scanning."}</span>
        </section>
      )}

      <footer>
        <MailCheck size={15} />
        Same backend as the web app
      </footer>

      <button aria-label="Resize popup" className="popup-resize-handle" onPointerDown={beginResize} type="button">
        <span />
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
