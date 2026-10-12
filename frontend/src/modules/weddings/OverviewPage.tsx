import { Link } from "react-router-dom";
import type { EventReplySummary, WeddingEvent } from "../../api/types";
import { useSession } from "../../auth/session";
import { ErrorState } from "../../components/EmptyState";
import { Icon, type IconName } from "../../components/Icon";
import { Callout, Metric, ProgressBar } from "../../components/misc";
import { PageLoader } from "../../components/Spinner";
import { daysUntil, formatEventWhen, formatLongDate, parseDate, pluralize } from "../../lib/format";
import { useWeddingSummary } from "./api";
import { useEvents, useWedding } from "./WeddingContext";

export default function OverviewPage() {
  const wedding = useWedding();
  const events = useEvents();
  const summary = useWeddingSummary(wedding.id);
  const days = daysUntil(wedding.wedding_date);
  const base = `/weddings/${wedding.id}`;

  return (
    <div className="stack-lg">
      <section className="overview-hero">
        <div>
          <div className="eyebrow">Overview</div>
          <h1>{wedding.couple_names}</h1>
          <div className="hero-meta">
            {wedding.wedding_date ? formatLongDate(parseDate(wedding.wedding_date)) : "Date to be confirmed"}
            {wedding.title !== wedding.couple_names && <span className="dot-sep">{wedding.title}</span>}
          </div>
        </div>
        {days !== null && days >= 0 && (
          <div className="overview-countdown">
            <div className="big num">{days === 0 ? "Today" : days}</div>
            <div className="small muted">{days === 0 ? "is the day!" : days === 1 ? "day to go" : "days to go"}</div>
          </div>
        )}
      </section>

      {summary.isPending ? (
        <PageLoader label="Loading summary…" />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-tile">
              <div className="stat">
                <span className="stat-value">{summary.data.guests_total}</span>
                <span className="stat-label">Guests on the list</span>
              </div>
            </div>
            {summary.data.events.map((e) => (
              <div className="stat-tile" key={e.event_id}>
                <div className="stat">
                  <span className="stat-value">{e.confirmed_headcount}</span>
                  <span className="stat-label">Confirmed for {e.event_name}</span>
                </div>
              </div>
            ))}
          </div>

          {summary.data.guests_without_email > 0 && (
            <Callout tone="warning">
              <strong>{pluralize(summary.data.guests_without_email, "guest")} without an email address.</strong>{" "}
              They won't receive emailed invitations. Add their email on the <Link to={`${base}/guests`}>Guests</Link>{" "}
              page, or post their invitation and mark it as sent on the <Link to={`${base}/replies`}>Replies</Link>{" "}
              page.
            </Callout>
          )}

          {summary.data.guests_total === 0 ? (
            <GettingStarted base={base} />
          ) : (
            <div className="event-summary-grid">
              {summary.data.events.map((s) => (
                <EventSummaryCard
                  key={s.event_id}
                  summary={s}
                  event={events.find((e) => e.id === s.event_id)}
                  base={base}
                />
              ))}
            </div>
          )}

          <DietarySection events={summary.data.events} />
        </>
      )}

      <section className="stack">
        <h2 className="section-title">Quick links</h2>
        <div className="quick-links">
          <QuickLink to={`${base}/guests`} icon="users" title="Guest list" text="Add guests and choose who's invited to what" />
          <QuickLink to={`${base}/invitations`} icon="envelope" title="Invitations" text="Design the card and send it by email" />
          <QuickLink to={`${base}/replies`} icon="inbox" title="Replies" text="See who's coming and chase the rest" />
          <QuickLink to={`${base}/seating`} icon="table" title="Seating plan" text="Arrange tables and keep feuds apart" />
        </div>
      </section>
    </div>
  );
}

function GettingStarted({ base }: { base: string }) {
  const { canEdit } = useSession();
  return (
    <div className="card card-pad stack-sm">
      <h2 className="section-title">Let's get started</h2>
      <p className="muted" style={{ margin: 0 }}>
        {canEdit
          ? "Add your guests first (one by one, or import a spreadsheet), then design and send the invitations."
          : "No guests have been added yet."}
      </p>
      {canEdit && (
        <div className="row">
          <Link className="btn btn-primary" to={`${base}/guests`}>
            <Icon name="users" /> Add guests
          </Link>
          <Link className="btn btn-secondary" to={`${base}/settings`}>
            <Icon name="calendar" /> Event details
          </Link>
        </div>
      )}
    </div>
  );
}

function EventSummaryCard({
  summary: s,
  event,
  base,
}: {
  summary: EventReplySummary;
  event?: WeddingEvent;
  base: string;
}) {
  const replied = s.attending + s.declined;
  return (
    <article className="card event-summary">
      <header className="card-header">
        <div>
          <h2>{s.event_name}</h2>
          {event?.starts_at && <div className="small muted">{formatEventWhen(event.starts_at, event.ends_at)}</div>}
          {event?.venue_name && <div className="small muted">{event.venue_name}</div>}
        </div>
      </header>
      <div className="card-body">
        {s.invited === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            Nobody is invited to this event yet. Tick the {s.event_name} column on the{" "}
            <Link to={`${base}/guests`}>Guests</Link> page.
          </p>
        ) : (
          <>
            <div className="metrics">
              <Metric label="Invitations sent" value={s.invites_sent} total={s.invited} />
              <Metric
                label="Opened"
                value={s.opened}
                total={s.invites_sent}
                tone="warning"
                hint={s.invites_sent === 0 ? "Counts guests who open the link in their email." : undefined}
              />
              <div className="metric-row">
                <div className="metric-label">
                  <span>Replies</span>
                  <strong>
                    {replied}
                    <span className="muted" style={{ fontWeight: 400 }}>
                      {" "}
                      / {s.invited}
                    </span>
                  </strong>
                </div>
                <ProgressBar
                  label="Replies"
                  total={s.invited}
                  segments={[
                    { value: s.attending, tone: "success", label: "Attending" },
                    { value: s.declined, tone: "danger", label: "Declined" },
                  ]}
                />
                <div className="rsvp-legend">
                  <span className="l-yes">{s.attending} attending</span>
                  <span className="l-no">{s.declined} declined</span>
                  <span className="l-wait">{s.pending} awaiting reply</span>
                </div>
              </div>
            </div>

            {s.opened_no_reply > 0 && (
              <div className="nudge">
                <span>
                  <strong>{s.opened_no_reply}</strong> opened the invitation but haven't replied.
                </span>
                <Link to={`${base}/replies?event=${s.event_id}&engagement=opened`}>See who</Link>
              </div>
            )}

            <div className="headcount">
              <div className="stat">
                <span className="stat-value">{s.confirmed_headcount}</span>
                <span className="stat-label">Confirmed headcount</span>
              </div>
              <div className="stat">
                <span className="stat-value">{s.potential_headcount}</span>
                <span className="stat-label">Potential headcount</span>
              </div>
              <div className="stat">
                <span className="stat-value">{s.children_attending}</span>
                <span className="stat-label">Children attending</span>
              </div>
            </div>
            <div className="tiny muted" style={{ marginTop: 10 }}>
              {pluralize(s.invited, "guest")} invited · {pluralize(s.invites_not_sent, "invitation")} not sent yet ·{" "}
              {s.plus_ones_attending} of {pluralize(s.plus_ones_allowed, "plus-one")} coming
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function DietarySection({ events }: { events: EventReplySummary[] }) {
  // The same guest appears once per event; list each person once.
  const notes = new Map<string, { requirements: string; events: string[] }>();
  for (const e of events) {
    for (const d of e.dietary) {
      const key = `${d.name}\u0000${d.requirements}`;
      const existing = notes.get(key);
      if (existing) existing.events.push(e.event_name);
      else notes.set(key, { requirements: d.requirements, events: [e.event_name] });
    }
  }
  if (notes.size === 0) return null;
  return (
    <section className="card">
      <header className="card-header">
        <h2 className="section-title">Dietary requirements</h2>
        <span className="small muted">From guests who are attending</span>
      </header>
      <div className="card-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
        <ul className="list-plain dietary-list">
          {[...notes.entries()].map(([key, note]) => (
            <li key={key}>
              <span>
                <strong>{key.split("\u0000")[0]}</strong>
                <span className="tiny muted"> · {note.events.join(", ")}</span>
              </span>
              <span className="muted">{note.requirements}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function QuickLink({ to, icon, title, text }: { to: string; icon: IconName; title: string; text: string }) {
  return (
    <Link to={to} className="quick-link">
      <Icon name={icon} />
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </Link>
  );
}
