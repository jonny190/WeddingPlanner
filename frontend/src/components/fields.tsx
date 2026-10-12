import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "../lib/utils";
import { Icon } from "./Icon";

interface FieldChrome {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  /** Visually hide the label (it is still read by screen readers). */
  hideLabel?: boolean;
}

function FieldWrapper({
  id,
  label,
  hint,
  error,
  optional,
  className,
  hideLabel,
  children,
}: FieldChrome & { id: string; children: ReactNode }) {
  return (
    <div className={cx("field", className)}>
      <label htmlFor={id} className={cx("field-label", hideLabel && "sr-only")}>
        {label}
        {optional && <span className="optional"> (optional)</span>}
      </label>
      {children}
      {hint && !error && (
        <span className="field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field-error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

type TextFieldProps = FieldChrome & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, optional, className, hideLabel, id: idProp, ...input },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldWrapper {...{ id, label, hint, error, optional, className, hideLabel }}>
      <input
        ref={ref}
        id={id}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...input}
      />
    </FieldWrapper>
  );
});

type TextAreaFieldProps = FieldChrome & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">;

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextAreaField(
  { label, hint, error, optional, className, hideLabel, id: idProp, ...textarea },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldWrapper {...{ id, label, hint, error, optional, className, hideLabel }}>
      <textarea
        ref={ref}
        id={id}
        className="textarea"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...textarea}
      />
    </FieldWrapper>
  );
});

type SelectFieldProps = FieldChrome &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & { children: ReactNode };

export function SelectField({
  label,
  hint,
  error,
  optional,
  className,
  hideLabel,
  id: idProp,
  children,
  ...select
}: SelectFieldProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldWrapper {...{ id, label, hint, error, optional, className, hideLabel }}>
      <select
        id={id}
        className="select"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...select}
      >
        {children}
      </select>
    </FieldWrapper>
  );
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
}

export function Checkbox({ label, hint, className, ...input }: CheckboxProps) {
  return (
    <label className={cx("checkbox", className)}>
      <input type="checkbox" {...input} />
      <span>
        {label}
        {hint && <span className="hint">{hint}</span>}
      </span>
    </label>
  );
}

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> {
  value: string;
  onChange: (value: string) => void;
  label: string;
}

export function SearchInput({ value, onChange, label, className, placeholder, ...rest }: SearchInputProps) {
  return (
    <div className={cx("search-input", className)}>
      <Icon name="search" />
      <input
        type="search"
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={placeholder ?? label}
        {...rest}
      />
    </div>
  );
}

interface RadioCardProps {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  title: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export function RadioCard({ name, value, checked, onChange, title, description, disabled }: RadioCardProps) {
  return (
    <label className="radio-card">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
      />
      <span>
        <span className="title">{title}</span>
        {description && (
          <>
            <br />
            <span className="desc">{description}</span>
          </>
        )}
      </span>
    </label>
  );
}
