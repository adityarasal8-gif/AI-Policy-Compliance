/* Background service worker for extension-level fetches to avoid CORS issues from page context.
   Listens for messages from content scripts and performs safe fetches using the extension origin.
*/

import type { AnalyzeRequest, RewriteRequest } from "@complylens/shared";

async function readApiBaseUrl() {
  return new Promise<string>((resolve) => {
    chrome.storage?.local?.get(["complylensApiBaseUrl"], (result) => {
      resolve(result.complylensApiBaseUrl || "http://127.0.0.1:8000");
    });
  });
}

async function readAuthToken() {
  return new Promise<string | undefined>((resolve) => {
    chrome.storage?.local?.get(["complylensFirebaseToken"], (result) => {
      resolve(result.complylensFirebaseToken);
    });
  });
}

async function proxyJson<TPayload>(path: string, payload: TPayload) {
  const base = await readApiBaseUrl();
  const token = await readAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  try {
    return { ok: response.ok, status: response.status, json: JSON.parse(text) };
  } catch {
    return { ok: response.ok, status: response.status, text };
  }
}

async function handleBackendRequest<TPayload>(path: string, payload: TPayload) {
  return proxyJson(path, payload);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["complylensExtensionSettings"], (result) => {
    if (result.complylensExtensionSettings) return;
    chrome.storage.local.set({
      complylensExtensionSettings: {
        enabled: true,
        mockMode: true,
        backendUrl: "http://127.0.0.1:8000",
        autoScan: false,
        severityThreshold: "medium"
      }
    });
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === "analyze") {
        const payload: AnalyzeRequest = message.payload;
        sendResponse(await handleBackendRequest("/analyze", payload));
        return;
      }

      if (message?.type === "rewrite") {
        const payload: RewriteRequest = message.payload;
        sendResponse(await handleBackendRequest("/rewrite", payload));
        return;
      }

      sendResponse({ ok: false, error: "unknown_message" });
    } catch (error) {
      sendResponse({ ok: false, error: (error as Error).message });
    }
  })();
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "complylens-backend") return;

  port.onMessage.addListener((message) => {
    (async () => {
      try {
        const requestId = message?.requestId;
        if (message?.type === "analyze") {
          const payload: AnalyzeRequest = message.payload;
          port.postMessage({ requestId, ...(await handleBackendRequest("/analyze", payload)) });
          return;
        }

        if (message?.type === "rewrite") {
          const payload: RewriteRequest = message.payload;
          port.postMessage({ requestId, ...(await handleBackendRequest("/rewrite", payload)) });
          return;
        }

        port.postMessage({ requestId, ok: false, error: "unknown_message" });
      } catch (error) {
        port.postMessage({ requestId: message?.requestId, ok: false, error: (error as Error).message });
      }
    })();
  });
});
