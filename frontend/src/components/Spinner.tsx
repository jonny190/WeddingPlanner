import { cx } from "../lib/utils";

export function Spinner({ large = false, label }: { large?: boolean; label?: string }) {
  return (
    <span
      className={cx("spinner", large && "spinner-lg")}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

/** Centred spinner for a page or panel that is loading. */
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <span className="spinner spinner-lg" aria-hidden="true" />
      <span className="small">{label}</span>
    </div>
  );
}
