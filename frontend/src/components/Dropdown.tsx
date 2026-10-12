import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../lib/utils";

interface DropdownProps {
  /** Contents of the trigger button. */
  trigger: ReactNode;
  /** Accessible name for the trigger when its contents are not descriptive. */
  label?: string;
  triggerClassName?: string;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  className?: string;
}

/** A button that opens a menu of actions. Closes on outside click and Escape. */
export function Dropdown({ trigger, label, triggerClassName, children, align = "right", className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    // Focus the first item for keyboard users.
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const close = () => setOpen(false);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    e.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[next].focus();
  };

  return (
    <div className={cx("menu-wrap", className)} ref={wrapRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className={triggerClassName ?? "btn btn-ghost"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          className="menu"
          style={align === "left" ? { left: 0, right: "auto" } : undefined}
          onClick={(e) => {
            // Close after choosing an item (links and buttons).
            if ((e.target as HTMLElement).closest('[role="menuitem"]')) setOpen(false);
          }}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
