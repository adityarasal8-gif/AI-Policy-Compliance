import type { ComplianceReport, Severity, Violation } from "./types";

export function severityLabel(severity: Severity) {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export function applyRewrite(text: string, violation: Violation) {
  const quote = violation.quote.trim();
  const rewrite = violation.rewrite.trim();
  if (!quote || !rewrite) return text;

  const normalized = (value: string) => value.replace(/\s+/g, " ").trim();
  const applyAtIndex = (matchIndex: number, matchLength: number) => {
    return text.slice(0, matchIndex) + rewrite + text.slice(matchIndex + matchLength);
  };

  const exactIndex = text.indexOf(quote);
  if (exactIndex >= 0) {
    return applyAtIndex(exactIndex, quote.length);
  }

  const caseInsensitiveIndex = text.toLowerCase().indexOf(quote.toLowerCase());
  if (caseInsensitiveIndex >= 0) {
    return applyAtIndex(caseInsensitiveIndex, quote.length);
  }

  // Fuzzy lookup: match by normalized whitespace and punctuation-free tokens.
  const quoteTokens = normalized(quote)
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 1)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (!quoteTokens.length) return text;

  const quotePattern = quoteTokens.join("[^\\p{L}\\p{N}]+") || quoteTokens.join("\\s+");
  const regex = new RegExp(quotePattern, "iu");
  const match = regex.exec(text);
  if (!match || match.index == null) return text;

  return applyAtIndex(match.index, match[0].length);
}

function findSentenceStart(text: string, fromIndex: number) {
  let index = Math.max(0, fromIndex);
  while (index > 0) {
    const previous = text[index - 1];
    if (previous === "\n" || previous === "." || previous === "!" || previous === "?") {
      break;
    }
    index -= 1;
  }

  while (index < text.length && /\s/.test(text[index])) {
    index += 1;
  }

  return index;
}

function findSentenceEnd(text: string, fromIndex: number) {
  let index = Math.min(text.length, fromIndex);
  while (index < text.length) {
    const current = text[index];
    if (current === "\n" || current === "." || current === "!" || current === "?") {
      index += 1;
      break;
    }
    index += 1;
  }

  while (index < text.length && /\s/.test(text[index])) {
    index += 1;
  }

  return index;
}
