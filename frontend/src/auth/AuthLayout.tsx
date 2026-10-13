import type { ReactNode } from "react";
import { BrandMark } from "../layout/Brand";
import "./auth.css";

export function AuthLayout({ title, subtitle, children, footer }: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="auth-page">
      <aside className="auth-aside" aria-hidden="true">
        <div className="auth-aside-inner">
          <BrandMark light />
          <div>
            <p className="auth-quote">Every guest, every reply, every seat — beautifully in hand.</p>
            <p className="auth-quote-sub">Guest lists, invitations, RSVPs and seating plans for couples and planners.</p>
          </div>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-brand-mobile">
            <BrandMark />
          </div>
          <h1>{title}</h1>
          {subtitle && <p className="muted auth-subtitle">{subtitle}</p>}
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
