import { severityWeight } from "./settings";
import type { ComplianceAnalysis, ComplianceFinding, ExtensionSettings, Severity } from "./types";

type Rule = {
  id: string;
  severity: Severity;
  policyCitation: string;
  explanation: string;
  suggestedRewrite: string;
  patterns: RegExp[];
};

const rules: Rule[] = [
  {
    id: "delivery-guarantee",
    severity: "high",
    policyCitation: "Commercial Communications Policy 4.1 - Delivery Commitments",
    explanation: "The draft makes a firm delivery promise that may create legal or service-level exposure without approval.",
    suggestedRewrite: "We are targeting this delivery window and will confirm the final timeline after internal approval.",
    patterns: [/guarantee(?:d)? delivery/gi, /will deliver by [^.!\n]+/gi, /promise (?:we|to) (?:deliver|complete)/gi]
  },
  {
    id: "customer-data-sharing",
    severity: "critical",
    policyCitation: "Customer Data Handling Standard 3.2 - External Sharing",
    explanation: "The draft appears to share customer records, account details, or personal data outside approved systems.",
    suggestedRewrite: "Please use the approved secure transfer workflow once the recipient is authorized.",
    patterns: [/share (?:the )?(?:customer|client).{0,36}(?:data|record|account|id)/gi, /send (?:over )?(?:customer|client).{0,36}(?:details|records|data)/gi, /account id[s]?:? [a-z0-9-]+/gi]
  },
  {
    id: "legal-certainty",
    severity: "medium",
    policyCitation: "Legal Claims Guidance 2.1 - Certainty Language",
    explanation: "The language sounds legally definitive and should be softened unless reviewed by Legal.",
    suggestedRewrite: "Based on our current understanding, this appears supportable subject to final legal review.",
    patterns: [/we are legally certain/gi, /this is fully compliant/gi, /no legal risk/gi]
  },
  {
    id: "financial-commitment",
    severity: "high",
    policyCitation: "Forward-Looking Statements Guide 1.3 - Forecast Disclaimer",
    explanation: "The draft includes a risky financial commitment or forward-looking claim without approved disclaimer language.",
    suggestedRewrite: "Our current target remains subject to final confirmation and approved financial disclosure language.",
    patterns: [/guarantee(?:d)? (?:returns|revenue|profit|savings)/gi, /will increase (?:revenue|profit|margin)/gi, /risk-free investment/gi]
  },
  {
    id: "external-sharing",
    severity: "medium",
    policyCitation: "Vendor Security Policy 5.4 - External Recipients",
    explanation: "The draft references external sharing and should confirm authorization before information leaves approved channels.",
    suggestedRewrite: "I can share the approved summary through the authorized external collaboration channel.",
    patterns: [/send (?:this|it|the file) to (?:the )?(?:vendor|external|partner)/gi, /forward (?:this|the thread|the file) externally/gi]
  }
];

export async function analyzeCompliance(text: string, settings: ExtensionSettings): Promise<ComplianceAnalysis> {
  if (!settings.enabled) {
    return {
      id: crypto.randomUUID(),
      score: 100,
      riskLevel: "Ready",
      summary: "ComplyLens extension is disabled.",
      findings: []
    };
  }

  if (!settings.mockMode) {
    return analyzeWithBackend(text, settings);
  }

  return mockAnalysis(text, settings);
}

async function analyzeWithBackend(text: string, settings: ExtensionSettings): Promise<ComplianceAnalysis> {
  // Backend integration seam. Kept intentionally isolated so UI never depends on mock internals.
  return mockAnalysis(text, settings);
}

export async function mockAnalysis(text: string, settings: ExtensionSettings): Promise<ComplianceAnalysis> {
  await new Promise((resolve) => window.setTimeout(resolve, 260));
  const findings: ComplianceFinding[] = [];

  for (const rule of rules) {
    if (severityWeight(rule.severity) < severityWeight(settings.severityThreshold)) continue;
    for (const pattern of rule.patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (!match?.[0]) continue;
      findings.push({
        id: `${rule.id}-${findings.length + 1}`,
        severity: rule.severity,
        confidence: confidenceFor(rule.severity, match[0]),
        matchedText: match[0],
        policyCitation: rule.policyCitation,
        explanation: rule.explanation,
        suggestedRewrite: rule.suggestedRewrite
      });
      break;
    }
  }

  const score = Math.max(12, 100 - findings.reduce((total, finding) => total + severityWeight(finding.severity) * 13, 0));
  const riskLevel = findings.some((finding) => finding.severity === "critical" || finding.severity === "high")
    ? "High risk"
    : findings.length
      ? "Needs review"
      : "Ready";

  return {
    id: crypto.randomUUID(),
    score,
    riskLevel,
    summary: findings.length
      ? `${findings.length} policy risk${findings.length === 1 ? "" : "s"} detected before sending.`
      : "No policy risks detected in this draft.",
    findings
  };
}

function confidenceFor(severity: Severity, phrase: string) {
  const base = { low: 0.72, medium: 0.81, high: 0.88, critical: 0.93 }[severity];
  return Math.min(0.98, Number((base + Math.min(phrase.length, 60) / 600).toFixed(2)));
}
