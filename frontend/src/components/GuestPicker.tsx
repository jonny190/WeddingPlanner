import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cx, matches } from "../lib/utils";
import { Icon } from "./Icon";
import { SearchInput } from "./fields";

export interface PickerOption {
  id: string;
  name: string;
  /** Secondary text (group, email, ...). */
  detail?: string | null;
}

interface GuestPickerProps {
  label: string;
  options: PickerOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}

/** Searchable single-guest picker (ARIA combobox). */
export function GuestPicker({ label, options, value, onChange, placeholder, disabled, hint }: GuestPickerProps) {
  const id = useId();
  const listId = `${id}-list`;
  const selected = options.find((o) => o.id === value) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => options.filter((o) => matches([o.name, o.detail], query)).slice(0, 50),
    [options, query],
  );

  const choose = (option: PickerOption) => {
    onChange(option.id);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[active]) {
        e.preventDefault();
        choose(filtered[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    }
  };

  return (
    <div className="field picker">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="picker-control">
        <Icon name="search" />
        <input
          ref={inputRef}
          id={id}
          className="input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? `${id}-opt-${filtered[active].id}` : undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={selected ? selected.name : (placeholder ?? "Search guests…")}
          value={open ? query : selected ? selected.name : query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setActive(0);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        {selected && !disabled && (
          <button
            type="button"
            className="icon-btn picker-clear"
            aria-label={`Clear ${label}`}
            onClick={() => {
              onChange(null);
              inputRef.current?.focus();
            }}
          >
            <Icon name="close" />
          </button>
        )}
        {open && (
          <ul className="picker-list" id={listId} role="listbox" aria-label={label}>
            {filtered.length === 0 && <li className="picker-empty">No matching guests</li>}
            {filtered.map((o, i) => (
              <li
                key={o.id}
                id={`${id}-opt-${o.id}`}
                role="option"
                aria-selected={o.id === value}
                className={cx("picker-option", i === active && "active")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span>{o.name}</span>
                {o.detail && <span className="tiny muted">{o.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

interface GuestMultiSelectProps {
  label: string;
  options: PickerOption[];
  value: string[];
  onChange: (ids: string[]) => void;
}

/** Searchable checkbox list for choosing several guests. */
export function GuestMultiSelect({ label, options, value, onChange }: GuestMultiSelectProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => options.filter((o) => matches([o.name, o.detail], query)), [options, query]);
  const chosen = new Set(value);
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };
  const allShownChosen = filtered.length > 0 && filtered.every((o) => chosen.has(o.id));
  return (
    <fieldset className="multi-select">
      <legend className="field-label">{label}</legend>
      <div className="row" style={{ marginBottom: 8 }}>
        <SearchInput value={query} onChange={setQuery} label="Filter guests" className="grow" />
        <button
          type="button"
          className="link-btn small"
          onClick={() => {
            const next = new Set(chosen);
            filtered.forEach((o) => (allShownChosen ? next.delete(o.id) : next.add(o.id)));
            onChange([...next]);
          }}
        >
          {allShownChosen ? "Clear shown" : "Select shown"}
        </button>
      </div>
      <div className="multi-select-list">
        {filtered.length === 0 && <div className="picker-empty">No matching guests</div>}
        {filtered.map((o) => (
          <label key={o.id} className="checkbox multi-select-item">
            <input type="checkbox" checked={chosen.has(o.id)} onChange={() => toggle(o.id)} />
            <span>
              {o.name}
              {o.detail && <span className="hint">{o.detail}</span>}
            </span>
          </label>
        ))}
      </div>
      <div className="tiny muted" style={{ marginTop: 6 }}>
        {value.length} selected
      </div>
    </fieldset>
  );
}
