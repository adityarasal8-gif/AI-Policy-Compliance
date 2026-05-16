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
