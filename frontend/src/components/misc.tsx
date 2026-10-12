import type { ReactNode } from "react";
import { cx } from "../lib/utils";
import { percent } from "../lib/format";
import { Icon, type IconName } from "./Icon";

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export interface ProgressSegment {
  value: number;
  tone?: "accent" | "success" | "danger" | "warning" | "muted";
  label?: string;
}

/** A single or stacked progress bar. */
export function ProgressBar({
  segments,
  total,
  label,
}: {
  segments: ProgressSegment[];
  total: number;
  label: string;
}) {
  const sum = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total || 1}
      aria-valuenow={sum}
    >
      {segments.map((seg, i) => (
        <span
          key={i}
          className={seg.tone && seg.tone !== "accent" ? `seg-${seg.tone}` : undefined}
          style={{ width: `${percent(seg.value, total)}%` }}
          title={seg.label ? `${seg.label}: ${seg.value}` : undefined}
        />
      ))}
    </div>
  );
}

export function Metric({
  label,
  value,
  total,
  tone,
  hint,
}: {
  label: ReactNode;
  value: number;
  total: number;
  tone?: ProgressSegment["tone"];
  hint?: ReactNode;
}) {
  return (
    <div className="metric-row">
      <div className="metric-label">
        <span>{label}</span>
        <strong>
          {value}
          <span className="muted" style={{ fontWeight: 400 }}>
            {" "}
            / {total}
          </span>
        </strong>
      </div>
      <ProgressBar segments={[{ value, tone }]} total={total} label={typeof label === "string" ? label : "Progress"} />
      {hint && <span className="tiny muted">{hint}</span>}
    </div>
  );
}

export function Callout({
  tone = "info",
  icon,
  children,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success" | "accent";
  icon?: IconName;
  children: ReactNode;
  className?: string;
}) {
  const fallbackIcon: IconName =
    tone === "warning" || tone === "danger" ? "alert" : tone === "success" ? "checkCircle" : "info";
  return (
    <div className={cx("callout", `callout-${tone}`, className)} role={tone === "danger" ? "alert" : undefined}>
      <Icon name={icon ?? fallbackIcon} />
      <div>{children}</div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  highlight,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={cx("stat-tile", highlight && "highlight")}>
      <div className="stat">
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
        {hint && <span className="tiny muted">{hint}</span>}
      </div>
    </div>
  );
}
