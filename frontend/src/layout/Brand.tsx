import { cx } from "../lib/utils";

/** "Wedding Planner" wordmark with a small interlocking-rings mark. */
export function BrandMark({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <span className={cx("brand", light && "brand-light", compact && "brand-compact")}>
      <svg className="brand-rings" viewBox="0 0 40 28" aria-hidden="true" focusable="false">
        <circle cx="15" cy="15" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="25" cy="13" r="10" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.6" />
      </svg>
      <span className="brand-name">Wedding Planner</span>
    </span>
  );
}
