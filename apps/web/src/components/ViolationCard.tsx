import { AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";
import { severityLabel, type Violation } from "@complylens/shared";

type Props = {
  violation: Violation;
  active?: boolean;
  onSelect: () => void;
};

export function ViolationCard({ violation, active, onSelect }: Props) {
  return (
    <button className={`violation-card ${active ? "active" : ""}`} onClick={onSelect}>
      <div className="violation-card__top">
        <span className={`severity severity--${violation.severity}`}>
          <AlertTriangle size={14} />
          {severityLabel(violation.severity)}
        </span>
        <span className="confidence">{Math.round(violation.confidence * 100)}%</span>
      </div>
      <strong>{violation.policyName}</strong>
      <span>{violation.violatedPolicy ?? `${violation.policyName}, ${violation.policySection}`}</span>
      <p>{violation.explanation}</p>
      <div className="rewrite-preview">
        <ClipboardCheck size={15} />
        <span>{violation.rewrite}</span>
      </div>
      <div className="card-status">
        <CheckCircle2 size={14} />
        Rewrite ready
      </div>
    </button>
  );
}
