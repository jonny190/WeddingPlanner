import { useState } from "react";
import { Link } from "react-router-dom";
import type { Wedding } from "../../api/types";
import { useSession } from "../../auth/session";
import { Button } from "../../components/Button";
import { EmptyState, ErrorState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/misc";
import { PageLoader } from "../../components/Spinner";
import { daysUntil, formatCountdown, formatLongDate, parseDate, pluralize } from "../../lib/format";
import { CreateAccountForm } from "../account/CreateAccountForm";
import { useWeddings } from "./api";
import { NewWeddingDialog } from "./NewWeddingDialog";
import "./weddings.css";

export default function WeddingsPage() {
  const { currentTenant, canEdit } = useSession();
  const [creating, setCreating] = useState(false);

  if (!currentTenant) {
    return (
      <div className="content-narrow">
        <EmptyState icon="briefcase" title="You're not part of an account yet">
          Create an account for your own wedding or your planning business. You can invite others to it later.
        </EmptyState>
        <div style={{ maxWidth: 420, margin: "0 auto" }}>
          <CreateAccountForm />
        </div>
      </div>
    );
  }

  return (
    <div className="content-narrow">
      <PageHeader
        eyebrow={currentTenant.name}
        title="Your weddings"
        subtitle="Everything for each celebration, from the guest list to the seating plan."
        actions={
          canEdit && (
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              New wedding
            </Button>
          )
        }
      />
      <WeddingList onCreate={() => setCreating(true)} canEdit={canEdit} />
      <NewWeddingDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function WeddingList({ onCreate, canEdit }: { onCreate: () => void; canEdit: boolean }) {
  const weddings = useWeddings();
  if (weddings.isPending) return <PageLoader label="Loading weddings…" />;
  if (weddings.isError) return <ErrorState error={weddings.error} onRetry={() => void weddings.refetch()} />;
  if (weddings.data.length === 0) {
    return (
      <div className="card">
        <EmptyState
          title="No weddings yet"
          actions={
            canEdit && (
              <Button variant="primary" icon="plus" onClick={onCreate}>
                Create your first wedding
              </Button>
            )
          }
        >
          {canEdit
            ? "Start with the couple's names and the date. We'll set up the day and evening events for you."
            : "Nothing has been set up in this account yet."}
        </EmptyState>
      </div>
    );
  }

  // Upcoming weddings first (soonest at the top), then undated, then past ones.
  const sorted = [...weddings.data].sort((a, b) => rank(a) - rank(b));
  return (
    <ul className="wedding-grid list-plain">
      {sorted.map((w) => (
        <li key={w.id}>
          <WeddingCard wedding={w} />
        </li>
      ))}
    </ul>
  );
}

function rank(w: Wedding): number {
  const days = daysUntil(w.wedding_date);
  if (days === null) return 1e6;
  return days >= 0 ? days : 2e6 - days;
}

function WeddingCard({ wedding }: { wedding: Wedding }) {
  const days = daysUntil(wedding.wedding_date);
  const past = days !== null && days < 0;
  return (
    <Link to={`/weddings/${wedding.id}`} className="wedding-card">
      <div className="wedding-card-band" aria-hidden="true">
        <svg viewBox="0 0 40 28" className="wedding-card-rings">
          <circle cx="15" cy="15" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="25" cy="13" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
        </svg>
      </div>
      <div className="wedding-card-body">
        <h2 className="wedding-card-names">{wedding.couple_names}</h2>
        {wedding.title !== wedding.couple_names && <div className="small muted">{wedding.title}</div>}
        <div className="wedding-card-date">
          <Icon name="calendar" />
          {wedding.wedding_date ? formatLongDate(parseDate(wedding.wedding_date)) : "Date to be confirmed"}
        </div>
        <div className="wedding-card-foot">
          <span className={past ? "countdown past" : "countdown"}>{formatCountdown(wedding.wedding_date)}</span>
          <span className="tiny muted">{pluralize(wedding.events.length, "event")}</span>
        </div>
      </div>
    </Link>
  );
}
