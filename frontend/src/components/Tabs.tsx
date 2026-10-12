import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../lib/utils";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
}

interface TabsProps<T extends string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  variant?: "underline" | "pills";
  /** Prefix for tab/panel ids so panels can reference their tab. */
  idPrefix?: string;
  className?: string;
}

/** Accessible tab list (arrow keys move between tabs). Render the panel yourself. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  variant = "underline",
  idPrefix = "tab",
  className,
}: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = tabs.filter((t) => !t.disabled);
    const index = enabled.findIndex((t) => t.id === value);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % enabled.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + enabled.length) % enabled.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = enabled.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = enabled[next];
    onChange(target.id);
    refs.current[tabs.indexOf(target)]?.focus();
  };

  return (
    <div
      className={cx("tabs", variant === "pills" && "tabs-pills", className)}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab, i) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${idPrefix}-${tab.id}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={selected ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idPrefix = "tab",
  activeId,
  children,
  className,
}: {
  idPrefix?: string;
  activeId: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      id={`${idPrefix}-panel`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-${activeId}`}
      className={className}
    >
      {children}
    </div>
  );
}
