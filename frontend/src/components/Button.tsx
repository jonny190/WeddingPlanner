import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { cx } from "../lib/utils";
import { Icon, type IconName } from "./Icon";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  block?: boolean;
}

function buttonClass({ variant = "secondary", size = "md", block }: ButtonStyleProps, extra?: string) {
  return cx("btn", `btn-${variant}`, size !== "md" && `btn-${size}`, block && "btn-block", extra);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleProps {
  loading?: boolean;
}

export function Button({
  variant,
  size,
  icon,
  block,
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, block }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends LinkProps, ButtonStyleProps {}

export function ButtonLink({ variant, size, icon, block, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass({ variant, size, block }, className)} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </Link>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Accessible name (also shown as a tooltip). */
  label: string;
  tone?: "default" | "danger";
  children?: ReactNode;
}

export function IconButton({ icon, label, tone = "default", className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx("icon-btn", tone === "danger" && "danger", className)}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}
