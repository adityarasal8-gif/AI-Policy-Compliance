const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const URL_PATTERN = /https?:\/\/\S+/g;
const DIGIT_PATTERN = /\b\d{4,}\b/g;

export function maskSensitiveText(value: string) {
  return value.replace(EMAIL_PATTERN, "[redacted email]").replace(URL_PATTERN, "[redacted link]").replace(DIGIT_PATTERN, "[redacted id]");
}

export function maskEmail(email: string) {
  return maskSensitiveText(email);
}

export function redactDocumentName(name: string) {
  const cleaned = maskSensitiveText(name).trim();
  if (!cleaned) return "Private document";
  return cleaned;
}