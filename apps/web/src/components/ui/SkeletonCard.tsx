interface SkeletonProps {
  lines?: number;
  variant?: "card" | "row" | "metric" | "text";
  className?: string;
}

function SkeletonLine({ width = "100%", height = "14px" }: { width?: string; height?: string }) {
  return <div className="skeleton-line" style={{ width, height }} />;
}

export function SkeletonCard({ lines = 3, variant = "card", className = "" }: SkeletonProps) {
  if (variant === "metric") {
    return (
      <div className={`skeleton-metric-card ${className}`}>
        <SkeletonLine width="55%" height="11px" />
        <SkeletonLine width="40%" height="28px" />
        <SkeletonLine width="70%" height="10px" />
      </div>
    );
  }

  if (variant === "row") {
    return (
      <div className={`skeleton-row-group ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div className="skeleton-row" key={i}>
            <SkeletonLine width="28px" height="28px" />
            <div style={{ flex: 1, display: "grid", gap: "6px" }}>
              <SkeletonLine width={`${60 + (i % 3) * 12}%`} height="13px" />
              <SkeletonLine width="45%" height="10px" />
            </div>
            <SkeletonLine width="60px" height="24px" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "text") {
    return (
      <div className={`skeleton-text-group ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonLine key={i} width={i === lines - 1 ? "65%" : "100%"} />
        ))}
      </div>
    );
  }

  return (
    <div className={`skeleton-card ${className}`}>
      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "14px" }}>
        <SkeletonLine width="36px" height="36px" />
        <div style={{ flex: 1, display: "grid", gap: "6px" }}>
          <SkeletonLine width="60%" height="14px" />
          <SkeletonLine width="40%" height="11px" />
        </div>
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={i === lines - 1 ? "75%" : "100%"} />
      ))}
    </div>
  );
}

export function MetricSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className="metric-skeleton-strip">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} variant="metric" />
      ))}
    </div>
  );
}
