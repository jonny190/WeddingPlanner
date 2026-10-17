import { useState } from "react";
import type { Venue, VenueStatus, WeddingEvent } from "../../api/types";
import { useSession } from "../../auth/session";
import { Badge, type BadgeTone } from "../../components/Badge";
import { Button, IconButton } from "../../components/Button";
import { useConfirm } from "../../components/ConfirmDialog";
import { EmptyState, ErrorState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/misc";
import { PageLoader } from "../../components/Spinner";
import { useToast } from "../../components/Toasts";
import { useDeleteVenue, useUpdateEvent, useVenues } from "../weddings/api";
import { useEvents, useWedding } from "../weddings/WeddingContext";
import { VenueFormModal } from "./VenueFormModal";
import "./venues.css";

export const VENUE_STATUS: Record<VenueStatus, { label: string; tone: BadgeTone }> = {
  booked: { label: "Booked", tone: "success" },
  shortlisted: { label: "Shortlisted", tone: "accent" },
  considering: { label: "Considering", tone: "neutral" },
  declined: { label: "Ruled out", tone: "danger" },
};

export function formatMoney(value: number | null, currency: string): string {
  if (value === null || value === undefined) return "";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export default function VenuesPage() {
  const wedding = useWedding();
  const events = useEvents();
  const { canEdit } = useSession();
  const venues = useVenues(wedding.id);
  const [editing, setEditing] = useState<Venue | "new" | null>(null);

  return (
    <div className="stack">
      <PageHeader
        title="Venues"
        subtitle="Every venue you are considering, with prices, contacts and notes. Choose one for each event and its address goes on the invitations and into guests' calendars."
        actions={
          canEdit && (
            <Button icon="plus" variant="primary" onClick={() => setEditing("new")}>
              Add venue
            </Button>
          )
        }
      />
      {venues.isPending ? (
        <PageLoader label="Loading venues…" />
      ) : venues.isError ? (
        <ErrorState error={venues.error} onRetry={() => void venues.refetch()} />
      ) : venues.data.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="pin"
            title="No venues yet"
            actions={
              canEdit && (
                <Button icon="plus" variant="primary" onClick={() => setEditing("new")}>
                  Add the first venue
                </Button>
              )
            }
          >
            Add the places you are looking at, compare what they cost, and keep the people you speak to in one place.
          </EmptyState>
        </div>
      ) : (
        <div className="venue-grid">
          {venues.data.map((venue) => (
            <VenueCard
              key={venue.id}
              venue={venue}
              events={events}
              weddingId={wedding.id}
              canEdit={canEdit}
              onEdit={() => setEditing(venue)}
            />
          ))}
        </div>
      )}
      {editing && (
        <VenueFormModal weddingId={wedding.id} venue={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function VenueCard({
  venue,
  events,
  weddingId,
  canEdit,
  onEdit,
}: {
  venue: Venue;
  events: WeddingEvent[];
  weddingId: string;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const remove = useDeleteVenue(weddingId);
  const updateEvent = useUpdateEvent(weddingId);
  const confirm = useConfirm();
  const toast = useToast();
  const status = VENUE_STATUS[venue.status];
  const prices = [
    venue.price !== null ? `Hire ${formatMoney(venue.price, venue.currency)}` : null,
    venue.price_per_head !== null ? `${formatMoney(venue.price_per_head, venue.currency)} per head` : null,
    venue.deposit !== null ? `Deposit ${formatMoney(venue.deposit, venue.currency)}` : null,
  ].filter(Boolean) as string[];
  const website = venue.website ? (/^https?:\/\//i.test(venue.website) ? venue.website : `https://${venue.website}`) : null;

  const onDelete = async () => {
    const inUse = venue.used_for.length > 0;
    const ok = await confirm({
      title: `Delete ${venue.name}?`,
      message: inUse
        ? `${venue.used_for.map((u) => u.event_name).join(" and ")} will keep the venue's name and address as typed-in text, but the prices, contacts and notes go.`
        : "Its prices, contacts and notes will be deleted. This can't be undone.",
      confirmLabel: "Delete venue",
      tone: "danger",
    });
    if (!ok) return;
    remove.mutate(venue.id, {
      onSuccess: () => toast.success(`${venue.name} deleted.`),
      onError: (err) => toast.error(err),
    });
  };

  const useFor = (event: WeddingEvent, on: boolean) => {
    updateEvent.mutate(
      { id: event.id, data: { venue_id: on ? venue.id : null } },
      {
        onSuccess: () =>
          toast.success(on ? `${venue.name} is now the venue for ${event.name}.` : `${event.name} no longer uses ${venue.name}.`),
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <article className="card venue-card" aria-label={venue.name}>
      <header className="venue-head">
        <div>
          <h2 className="venue-name">{venue.name}</h2>
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        </div>
        {canEdit && (
          <div className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
            <IconButton icon="edit" label={`Edit ${venue.name}`} onClick={onEdit} />
            <IconButton icon="trash" tone="danger" label={`Delete ${venue.name}`} onClick={() => void onDelete()} />
          </div>
        )}
      </header>

      <dl className="venue-facts">
        {venue.address && (
          <div>
            <dt>
              <Icon name="pin" /> Address
            </dt>
            <dd className="pre-line">{venue.address}</dd>
          </div>
        )}
        {venue.capacity !== null && (
          <div>
            <dt>
              <Icon name="users" /> Capacity
            </dt>
            <dd>Up to {venue.capacity} guests</dd>
          </div>
        )}
        {(website || venue.email || venue.phone) && (
          <div>
            <dt>
              <Icon name="link" /> Reach them
            </dt>
            <dd className="venue-links">
              {website && (
                <a href={website} target="_blank" rel="noreferrer">
                  {venue.website}
                </a>
              )}
              {venue.email && <a href={`mailto:${venue.email}`}>{venue.email}</a>}
              {venue.phone && <a href={`tel:${venue.phone}`}>{venue.phone}</a>}
            </dd>
          </div>
        )}
        {(prices.length > 0 || venue.price_notes) && (
          <div>
            <dt>
              <Icon name="file" /> Prices
            </dt>
            <dd>
              {prices.length > 0 && <div className="venue-prices">{prices.join(" · ")}</div>}
              {venue.price_notes && <div className="small muted pre-line">{venue.price_notes}</div>}
            </dd>
          </div>
        )}
        {venue.contacts.length > 0 && (
          <div>
            <dt>
              <Icon name="phone" /> Contacts
            </dt>
            <dd>
              <ul className="venue-contacts">
                {venue.contacts.map((c) => (
                  <li key={c.id}>
                    <strong>{c.name}</strong>
                    {c.role && <span className="muted"> · {c.role}</span>}
                    <span className="venue-links small">
                      {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
                      {c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}
                    </span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {venue.notes && (
          <div>
            <dt>
              <Icon name="edit" /> Notes
            </dt>
            <dd className="pre-line">{venue.notes}</dd>
          </div>
        )}
      </dl>

      <footer className="venue-uses">
        {events.map((event) => {
          const on = event.venue_id === venue.id;
          return canEdit ? (
            <Button
              key={event.id}
              size="sm"
              variant={on ? "secondary" : "ghost"}
              icon={on ? "check" : undefined}
              aria-pressed={on}
              disabled={updateEvent.isPending}
              onClick={() => useFor(event, !on)}
              title={on ? `Stop using ${venue.name} for ${event.name}` : `Use ${venue.name} for ${event.name}`}
            >
              {on ? `Venue for ${event.name}` : `Use for ${event.name}`}
            </Button>
          ) : (
            on && (
              <span key={event.id} className="tag">
                Venue for {event.name}
              </span>
            )
          );
        })}
      </footer>
    </article>
  );
}
