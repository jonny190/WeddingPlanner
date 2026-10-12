// Small form controls and UI primitives shared by the designer and the email editor.
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { IconChevronDown, IconClose } from "./icons";
import { clamp, parseHex, round } from "./model";

/** Label for the platform's shortcut modifier key. */
export const MOD_KEY =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "")
    ? "⌘"
    : "Ctrl";

export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Hooks

/** Width of an element, kept up to date with a ResizeObserver. Pass `ref` as the element's ref. */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number, T | null] {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width, el];
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function useViewportHeight(): number {
  const [height, setHeight] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800));
  useEffect(() => {
    const update = () => setHeight(window.innerHeight);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return height;
}

/** Call `onDismiss` when a pointer goes down outside `ref` while `open`. */
export function useDismiss(open: boolean, ref: RefObject<HTMLElement | null>, onDismiss: () => void): void {
  const callback = useRef(onDismiss);
  useLayoutEffect(() => {
    callback.current = onDismiss;
  });
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) callback.current();
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [open, ref]);
}

// ---------------------------------------------------------------------------
// Layout

export function Section({
  title,
  aside,
  children,
  className,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section className={cx("dz-section", className)} aria-labelledby={headingId}>
      <div className="dz-section-head">
        <h3 id={headingId} className="dz-section-title">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label?: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("dz-field", className)}>
      {label && (
        <label className="dz-label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {hint && <p className="dz-hint">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons

export function IconButton({
  label,
  shortcut,
  children,
  onClick,
  disabled,
  pressed,
  className,
  variant,
}: {
  label: string;
  shortcut?: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  className?: string;
  variant?: "danger" | "plain";
}) {
  return (
    <button
      type="button"
      className={cx("dz-icon-btn", variant && `dz-icon-btn-${variant}`, className)}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      className="dz-switch"
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="dz-switch-track" aria-hidden="true">
        <span className="dz-switch-thumb" />
      </span>
      <span className="dz-switch-label">{label}</span>
    </button>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/** A row of toggle buttons; exactly one is pressed. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  iconOnly,
  disabled,
}: {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  iconOnly?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="dz-segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="dz-segment"
          aria-pressed={o.value === value}
          aria-label={iconOnly ? o.label : undefined}
          title={iconOnly ? o.label : undefined}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          {!iconOnly && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Numbers

function formatNumber(value: number, decimals: number): string {
  return Number.isFinite(value) ? String(round(value, decimals)) : "";
}

/** Number input that lets people type freely and commits clamped values as they go. */
export function NumberInput({
  id,
  value,
  min,
  max,
  step = 1,
  decimals = 2,
  onChange,
  label,
  suffix,
  disabled,
  className,
}: {
  id?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  onChange: (value: number) => void;
  /** Accessible name (when there is no visible <label for>). */
  label?: string;
  suffix?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <span className={cx("dz-number", className)}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        className="dz-input dz-number-input"
        value={draft ?? formatNumber(value, decimals)}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        disabled={disabled}
        onFocus={() => setDraft(formatNumber(value, decimals))}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = parseFloat(e.target.value);
          if (Number.isFinite(parsed)) onChange(round(clamp(parsed, min, max), decimals));
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      {suffix && (
        <span className="dz-number-suffix" aria-hidden="true">
          {suffix}
        </span>
      )}
    </span>
  );
}

/** A labelled slider with a matching number input. */
export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  inputMin = min,
  inputMax = max,
  decimals = 2,
  suffix,
  onChange,
  disabled,
  aside,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** The number input may allow a wider range than the slider. */
  inputMin?: number;
  inputMax?: number;
  decimals?: number;
  suffix?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  aside?: ReactNode;
}) {
  const id = useId();
  const sliderValue = clamp(value, min, max);
  const fill = max > min ? ((sliderValue - min) / (max - min)) * 100 : 0;
  return (
    <div className="dz-field dz-slider-field">
      <div className="dz-field-row">
        <label className="dz-label" htmlFor={id}>
          {label}
        </label>
        <div className="dz-field-row-end">
          {aside}
          <NumberInput
            value={value}
            min={inputMin}
            max={inputMax}
            step={step}
            decimals={decimals}
            onChange={onChange}
            label={`${label} value`}
            suffix={suffix}
            disabled={disabled}
            className="dz-number-sm"
          />
        </div>
      </div>
      <input
        id={id}
        type="range"
        className="dz-range"
        min={min}
        max={max}
        step={step}
        value={sliderValue}
        disabled={disabled}
        style={{ "--dz-fill": `${fill}%` } as CSSProperties}
        onChange={(e) => onChange(round(clamp(parseFloat(e.target.value), min, max), decimals))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Colour

export function ColorField({
  label,
  value,
  onChange,
  swatches,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  swatches?: readonly string[];
  disabled?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const current = value.toLowerCase();
  return (
    <div className="dz-field dz-color-field">
      <label className="dz-label" htmlFor={id}>
        {label}
      </label>
      <div className="dz-color-row">
        <span className="dz-color-well" style={{ backgroundColor: value }}>
          <input
            type="color"
            className="dz-color-input"
            value={current}
            disabled={disabled}
            aria-label={`${label}: open colour picker`}
            onChange={(e) => onChange(e.target.value.toLowerCase())}
          />
        </span>
        <input
          id={id}
          className="dz-input dz-hex"
          value={draft ?? current}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          onFocus={() => setDraft(current)}
          onChange={(e) => {
            setDraft(e.target.value);
            const hex = parseHex(e.target.value);
            if (hex && e.target.value.replace("#", "").length === 6) onChange(hex);
          }}
          onBlur={(e) => {
            const hex = parseHex(e.target.value);
            if (hex && hex !== current) onChange(hex);
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <span id={`${id}-hint`} className="dz-visually-hidden">
          Hex colour, for example #3b302a
        </span>
      </div>
      {swatches && swatches.length > 0 && (
        <div className="dz-swatches" role="group" aria-label={`${label} suggestions`}>
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              className="dz-swatch"
              style={{ backgroundColor: c }}
              aria-label={`Use ${c}`}
              title={c}
              aria-pressed={c === current}
              disabled={disabled}
              onClick={() => onChange(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal dialog (native <dialog>: focus trapping, Escape and top-layer for free)

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = "md",
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const downOnBackdrop = useRef(false);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    // Remember what had focus before opening (once, even under StrictMode's double effects).
    if (!restoreFocus.current && document.activeElement instanceof HTMLElement) {
      restoreFocus.current = document.activeElement;
    }
    if (dialog && !dialog.open && typeof dialog.showModal === "function") dialog.showModal();
    return () => {
      // The parent unmounts the dialog to close it; hand focus back once it has gone.
      window.setTimeout(() => {
        if (dialog?.isConnected) return; // still mounted (StrictMode re-run)
        const target = restoreFocus.current;
        if (target?.isConnected) target.focus({ preventScroll: true });
      }, 0);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={cx("dz-modal", `dz-modal-${size}`)}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnBackdrop.current) onClose();
      }}
    >
      <div className="dz-modal-inner">
        <header className="dz-modal-head">
          <h2 id={titleId} className="dz-modal-title">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose} variant="plain">
            <IconClose />
          </IconButton>
        </header>
        <div className="dz-modal-body">{children}</div>
        {footer && <footer className="dz-modal-foot">{footer}</footer>}
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Menu button

export interface MenuItem {
  id: string;
  label: ReactNode;
  description?: ReactNode;
}

export function MenuButton({
  label,
  icon,
  items,
  onSelect,
  disabled,
  align = "start",
  emptyText = "Nothing to show",
}: {
  label: string;
  icon?: ReactNode;
  items: MenuItem[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  align?: "start" | "end";
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, wrapRef, close);

  useEffect(() => {
    if (open) itemRefs.current.find(Boolean)?.focus();
  }, [open]);

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = itemRefs.current.filter((el): el is HTMLButtonElement => !!el);
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (i: number) => list[(i + list.length) % list.length]?.focus();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAt(0);
        break;
      case "End":
        e.preventDefault();
        focusAt(list.length - 1);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div className="dz-menu-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="dz-btn dz-btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {icon}
        <span>{label}</span>
        <IconChevronDown size={14} />
      </button>
      {open && (
        <div
          className={cx("dz-menu", align === "end" && "dz-menu-end")}
          role="menu"
          id={menuId}
          aria-label={label}
          onKeyDown={onMenuKeyDown}
        >
          {items.length === 0 && <p className="dz-menu-empty">{emptyText}</p>}
          {items.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="dz-menu-item"
              onClick={() => {
                setOpen(false);
                onSelect(item.id);
              }}
            >
              <span className="dz-menu-item-label">{item.label}</span>
              {item.description && <span className="dz-menu-item-desc">{item.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
