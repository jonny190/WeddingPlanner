import type { ReactNode } from "react";
import "./rsvp.css";

/** Chrome-free layout for the pages wedding guests see. */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-page">
      <main className="public-main">{children}</main>
      <footer className="public-footer">
        Invitations by <span className="public-brand">Wedding Planner</span> · Coria
      </footer>
    </div>
  );
}

export function PublicMessage({ title, children, icon = "rings" }: { title: string; children?: ReactNode; icon?: "rings" | "alert" }) {
  return (
    <div className="public-message">
      <div className="public-message-mark" aria-hidden="true">
        {icon === "rings" ? (
          <svg viewBox="0 0 40 28">
            <circle cx="15" cy="15" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="25" cy="13" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
        )}
      </div>
      <h1>{title}</h1>
      {children && <div className="public-message-body">{children}</div>}
    </div>
  );
}
