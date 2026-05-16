import type { ExtensionSettings, Severity } from "./types";

const STORAGE_KEY = "complylensExtensionSettings";

export const defaultSettings: ExtensionSettings = {
  enabled: true,
  mockMode: true,
  backendUrl: "http://127.0.0.1:8000",
  autoScan: false,
  severityThreshold: "medium"
};

export function severityWeight(severity: Severity) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity];
}

export async function loadSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.storage?.local?.get([STORAGE_KEY], (result) => {
      resolve({ ...defaultSettings, ...(result?.[STORAGE_KEY] ?? {}) });
    });
  });
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage?.local?.set({ [STORAGE_KEY]: settings }, () => resolve());
  });
}

export function subscribeToSettings(callback: (settings: ExtensionSettings) => void) {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === "local" && changes[STORAGE_KEY]?.newValue) {
      callback({ ...defaultSettings, ...changes[STORAGE_KEY].newValue });
    }
  };
  chrome.storage?.onChanged?.addListener(listener);
  return () => chrome.storage?.onChanged?.removeListener(listener);
}
