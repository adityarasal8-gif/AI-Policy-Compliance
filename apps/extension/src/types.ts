export type Severity = "low" | "medium" | "high" | "critical";

export type RiskLevel = "Ready" | "Needs review" | "High risk";

export type ComplianceFinding = {
  id: string;
  severity: Severity;
  confidence: number;
  matchedText: string;
  policyCitation: string;
  explanation: string;
  suggestedRewrite: string;
};

export type ComplianceAnalysis = {
  id: string;
  score: number;
  riskLevel: RiskLevel;
  summary: string;
  findings: ComplianceFinding[];
};

export type ExtensionSettings = {
  enabled: boolean;
  mockMode: boolean;
  backendUrl: string;
  autoScan: boolean;
  severityThreshold: Severity;
};
