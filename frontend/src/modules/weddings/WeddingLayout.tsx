import { Suspense } from "react";
import { Outlet, useParams } from "react-router-dom";
import { isApiError } from "../../api/client";
import type { Wedding } from "../../api/types";
import { ButtonLink } from "../../components/Button";
import { EmptyState, ErrorState } from "../../components/EmptyState";
import { Icon, type IconName } from "../../components/Icon";
import { PageLoader } from "../../components/Spinner";
import { AppShell } from "../../layout/AppShell";
import { GuardedNavLink } from "../../layout/NavigationGuard";
import { formatCountdown, formatLongDate, parseDate } from "../../lib/format";
import { useWeddingQuery } from "./api";
import { WeddingProvider } from "./WeddingContext";
import "./weddings.css";

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "", label: "Overview", icon: "chart", end: true },
  { to: "guests", label: "Guests", icon: "users" },
  { to: "seating", label: "Seating", icon: "table" },
  { to: "menus", label: "Menus", icon: "dish" },
  { to: "venues", label: "Venues", icon: "pin" },
  { to: "invitations", label: "Invitations", icon: "envelope" },
  { to: "replies", label: "Replies", icon: "inbox" },
  { to: "settings", label: "Settings", icon: "settings" },
];

export default function WeddingLayout() {
  const { weddingId = "" } = useParams();
  const wedding = useWeddingQuery(weddingId);

  if (wedding.isPending) {
    return (
      <AppShell>
        <PageLoader label="Loading wedding…" />
      </AppShell>
    );
  }
  if (wedding.isError) {
    const notFound = isApiError(wedding.error, 404) || isApiError(wedding.error, 422);
    return (
      <AppShell>
        {notFound ? (
          <EmptyState
            icon="heart"
            title="Wedding not found"
            actions={<ButtonLink to="/">Back to your weddings</ButtonLink>}
          >
            It may have been deleted, or it belongs to another account.
          </EmptyState>
        ) : (
          <ErrorState error={wedding.error} onRetry={() => void wedding.refetch()} />
        )}
      </AppShell>
    );
  }

  return (
    <WeddingProvider wedding={wedding.data}>
      <AppShell sidebar={<WeddingSidebar wedding={wedding.data} />}>
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </AppShell>
    </WeddingProvider>
  );
}

function WeddingSidebar({ wedding }: { wedding: Wedding }) {
  const base = `/weddings/${wedding.id}`;
  return (
    <>
      <GuardedNavLink to="/" className="sidebar-back" end>
        <Icon name="chevronLeft" /> All weddings
      </GuardedNavLink>
      <div className="sidebar-wedding">
        <div className="couple">{wedding.couple_names}</div>
        <div className="when">
          {wedding.wedding_date ? formatLongDate(parseDate(wedding.wedding_date)) : "Date to be confirmed"}
          {wedding.wedding_date && (
            <>
              <br />
              {formatCountdown(wedding.wedding_date)}
            </>
          )}
        </div>
      </div>
      <ul className="nav-list">
        {NAV.map((item) => (
          <li key={item.label}>
            <GuardedNavLink
              to={item.to ? `${base}/${item.to}` : base}
              end={item.end}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              <Icon name={item.icon} />
              {item.label}
            </GuardedNavLink>
          </li>
        ))}
      </ul>
    </>
  );
}
