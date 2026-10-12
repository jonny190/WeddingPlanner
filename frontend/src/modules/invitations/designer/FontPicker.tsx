// Font family picker: a listbox grouped by category, each option shown in its own face.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cx, useDismiss } from "./controls";
import { CATEGORY_LABELS, findFont, fontStack, groupFonts } from "./fonts";
import { IconCheck, IconChevronDown } from "./icons";
import type { FontOption } from "./types";

export function FontPicker({
  id,
  label,
  value,
  fonts,
  onChange,
  disabled,
}: {
  id?: string;
  label: string;
  value: string;
  fonts: readonly FontOption[];
  onChange: (family: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const groups = useMemo(() => groupFonts(fonts), [fonts]);
  const flat = useMemo(() => groups.flatMap((g) => g.fonts), [groups]);
  const current = findFont(fonts, value);
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, wrapRef, close);

  const openList = () => {
    const index = flat.findIndex((f) => f.family === value);
    setActive(index >= 0 ? index : 0);
    setOpen(true);
  };

  useEffect(() => {
    if (open) listRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // optionId is derived from a stable id
  }, [open, active]);

  const choose = (family: string) => {
    if (family !== value) onChange(family);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = flat.length - 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => Math.min(last, i + 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        return;
      case "Home":
        e.preventDefault();
        setActive(0);
        return;
      case "End":
        e.preventDefault();
        setActive(last);
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        if (flat[active]) choose(flat[active].family);
        return;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
        return;
      case "Tab":
        setOpen(false);
        return;
    }
    // Type-ahead on the first letter.
    if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ch = e.key.toLowerCase();
      for (let step = 1; step <= flat.length; step++) {
        const i = (active + step) % flat.length;
        if (flat[i].family.toLowerCase().startsWith(ch)) {
          setActive(i);
          break;
        }
      }
    }
  };

  let index = -1;
  return (
    <div className="dz-font-picker" ref={wrapRef}>
      <button
        id={id}
        ref={buttonRef}
        type="button"
        className="dz-font-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${baseId}-list` : undefined}
        aria-label={`${label}: ${value}`}
        disabled={disabled || flat.length === 0}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
            e.preventDefault();
            openList();
          }
        }}
      >
        <span className="dz-font-trigger-name" style={{ fontFamily: fontStack(value, fonts) }}>
          {value}
        </span>
        <span className="dz-font-trigger-meta">{current ? CATEGORY_LABELS[current.category] : ""}</span>
        <IconChevronDown size={14} />
      </button>
      {open && (
        <div
          ref={listRef}
          id={`${baseId}-list`}
          className="dz-font-list"
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={flat[active] ? optionId(active) : undefined}
          onKeyDown={onListKeyDown}
        >
          {groups.map((group) => (
            <div key={group.category} role="group" aria-labelledby={`${baseId}-${group.category}`}>
              <div id={`${baseId}-${group.category}`} className="dz-font-group-label">
                {group.label}
              </div>
              {group.fonts.map((font) => {
                index += 1;
                const i = index;
                const selected = font.family === value;
                return (
                  <div
                    key={font.family}
                    id={optionId(i)}
                    role="option"
                    aria-selected={selected}
                    className={cx("dz-font-option", i === active && "dz-is-active", font.category === "script" && "dz-is-script")}
                    style={{ fontFamily: font.fallback }}
                    onPointerMove={() => i !== active && setActive(i)}
                    onClick={() => choose(font.family)}
                  >
                    <span>{font.family}</span>
                    {selected && <IconCheck size={14} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
