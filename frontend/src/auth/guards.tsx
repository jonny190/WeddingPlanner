import { Fragment, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ErrorState } from "../components/EmptyState";
import { PageLoader } from "../components/Spinner";
import { useSession } from "./session";

interface FromState {
  from?: string;
}

/** Only for signed-in users; everyone else goes to /login (and comes back afterwards). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.status === "loading") return <PageLoader label="Signing you in…" />;
  if (session.status === "error") {
    return (
      <div style={{ padding: "10vh 16px" }}>
        <ErrorState error={session.error} onRetry={session.retry} title="We couldn't load your account" />
      </div>
    );
  }
  if (session.status === "anonymous") {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ from } satisfies FromState} />;
  }
  // Remount everything when the account changes, so no data from the old account lingers.
  return <Fragment key={session.currentTenant?.id ?? "no-tenant"}>{children}</Fragment>;
}

/** Login and signup pages: signed-in users are sent on to the app. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.status === "loading") return <PageLoader />;
  if (session.status === "authenticated") {
    const from = (location.state as FromState | null)?.from;
    const target = from && from.startsWith("/") && !from.startsWith("/login") && !from.startsWith("/signup") ? from : "/";
    return <Navigate to={target} replace />;
  }
  return <>{children}</>;
}
