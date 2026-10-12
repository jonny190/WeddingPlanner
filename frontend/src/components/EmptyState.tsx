import type { ReactNode } from "react";
import { errorMessage } from "../api/client";
import { cx } from "../lib/utils";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon = "heart", title, children, actions, compact }: EmptyStateProps) {
  return (
    <div className={cx("empty-state", compact && "compact")}>
      <div className="empty-icon">
        <Icon name={icon} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

/** Shown when a query fails, with a retry button. */
export function ErrorState({
  error,
  onRetry,
  title = "We couldn't load this",
  compact,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  compact?: boolean;
}) {
  return (
    <div className={cx("empty-state", compact && "compact")} role="alert">
      <div className="empty-icon" style={{ background: "var(--c-danger-soft)", color: "var(--c-danger)" }}>
        <Icon name="alert" />
      </div>
      <h3>{title}</h3>
      <p>{errorMessage(error)}</p>
      {onRetry && (
        <div className="actions">
          <Button icon="refresh" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
