import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { assetUrl, isApiError } from "../../api/client";
import type { RsvpEvent, RsvpView } from "../../api/types";
import { daysUntil, formatDate, formatEventWhen, formatLongDate, parseDate } from "../../lib/format";
import { CardRenderer } from "../invitations/designer";
import { useRsvpView } from "./api";
import { PublicLayout, PublicMessage } from "./PublicLayout";
import { RsvpForm } from "./RsvpForm";

/** /rsvp/:token — a guest's invitation(s) and reply form. */
export default function RsvpPage() {
  const { token = "" } = useParams();
  const [params] = useSearchParams();
  const view = useRsvpView(token);
  const focusEvent = params.get("event");

  if (view.isPending) {
    return (
      <PublicLayout>
        <div className="public-loading" role="status">
          <span className="public-spinner" aria-hidden="true" />
          <p>Opening your invitation…</p>
        </div>
      </PublicLayout>
    );
  }

  if (view.isError) {
    const notFound = isApiError(view.error, 404) || isApiError(view.error, 422);
    return (
      <PublicLayout>
        <PublicMessage icon="alert" title={notFound ? "We couldn't find your invitation" : "Something went wrong"}>
          {notFound ? (
            <p>Please check you've used the full link from your invitation, or get in touch with the couple.</p>
          ) : (
            <>
              <p>We couldn't load your invitation just now. Please try again in a moment.</p>
              <button type="button" className="rsvp-btn" onClick={() => void view.refetch()}>
                Try again
              </button>
            </>
          )}
        </PublicMessage>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <Invitation token={token} view={view.data} focusEvent={focusEvent} />
    </PublicLayout>
  );
}

function Invitation({ token, view, focusEvent }: { token: string; view: RsvpView; focusEvent: string | null }) {
  // Show the form until every event has an answer; afterwards show the confirmation.
  const [editing, setEditing] = useState(
    () => !view.has_responded || view.events.some((e) => e.rsvp_status === "pending"),
  );
  const [justSent, setJustSent] = useState(false);

  // The event from the email link comes first.
  const events = useMemo(() => {
    const list = [...view.events];
    const i = list.findIndex((e) => e.event_id === focusEvent);
    if (i > 0) list.unshift(...list.splice(i, 1));
    return list;
  }, [view.events, focusEvent]);

  const deadline = earliestDeadline(events);

  return (
    <article className="rsvp">
      <header className="rsvp-hero">
        <p className="rsvp-eyebrow">The wedding of</p>
        <h1 className="rsvp-couple">{view.couple_names}</h1>
        {view.wedding_date && <p className="rsvp-date">{formatLongDate(parseDate(view.wedding_date))}</p>}
        <div className="rsvp-flourish" aria-hidden="true" />
        <p className="rsvp-greeting">Dear {view.first_name},</p>
      </header>

      {events.length === 0 ? (
        <section className="rsvp-panel rsvp-center">
          <h2>Nothing to reply to yet</h2>
          <p>
            {view.couple_names} haven't sent your invitation yet. Once they do, you'll find it here, along with a way
            to let them know if you can come.
          </p>
        </section>
      ) : (
        <>
          <div className="rsvp-events">
            {events.map((e) => (
              <EventInvitation key={e.event_id} event={e} view={view} />
            ))}
          </div>

          <section className="rsvp-panel" aria-labelledby="rsvp-reply-title">
            {editing ? (
              <>
                <h2 id="rsvp-reply-title">{view.has_responded ? "Change your reply" : "Will you join us?"}</h2>
                {deadline && <ReplyBy date={deadline} />}
                <RsvpForm
                  token={token}
                  view={view}
                  events={events}
                  onDone={() => {
                    setEditing(false);
                    setJustSent(true);
                    window.requestAnimationFrame(() =>
                      document.getElementById("rsvp-reply-title")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                    );
                  }}
                  onCancel={view.has_responded ? () => setEditing(false) : undefined}
                />
              </>
            ) : (
              <Confirmation
                view={view}
                events={events}
                justSent={justSent}
                onChange={() => {
                  setJustSent(false);
                  setEditing(true);
                }}
              />
            )}
          </section>
        </>
      )}
    </article>
  );
}

function EventInvitation({ event, view }: { event: RsvpEvent; view: RsvpView }) {
  const mapsUrl = event.venue_address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [event.venue_name, event.venue_address].filter(Boolean).join(", "),
      )}`
    : null;
  return (
    <section className="rsvp-event" aria-label={event.name}>
      <div className="rsvp-card-frame">
        <CardRenderer design={event.card} fonts={view.fonts} assetUrl={assetUrl} />
      </div>
      <div className="rsvp-details">
        <h2>{event.name}</h2>
        {event.starts_at && <p className="rsvp-when">{formatEventWhen(event.starts_at, event.ends_at)}</p>}
        {(event.venue_name || event.venue_address) && (
          <p className="rsvp-venue">
            {event.venue_name && <strong>{event.venue_name}</strong>}
            {event.venue_name && event.venue_address && <br />}
            {event.venue_address && <span className="rsvp-address">{event.venue_address}</span>}
            {mapsUrl && (
              <>
                <br />
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                  View on a map
                </a>
              </>
            )}
          </p>
        )}
        {event.details && <p className="rsvp-extra">{event.details}</p>}
        {event.plus_one_allowed && <p className="rsvp-note">You're very welcome to bring a guest.</p>}
      </div>
    </section>
  );
}

function ReplyBy({ date }: { date: string }) {
  const days = daysUntil(date);
  const d = parseDate(date);
  return (
    <p className="rsvp-reply-by">
      {days !== null && days < 0
        ? `The reply-by date (${formatDate(d)}) has passed, but please still let the couple know.`
        : `Kindly reply by ${formatLongDate(d)}.`}
    </p>
  );
}

function earliestDeadline(events: RsvpEvent[]): string | null {
  const dates = events.map((e) => e.rsvp_deadline).filter((d): d is string => Boolean(d));
  return dates.sort()[0] ?? null;
}

function Confirmation({
  view,
  events,
  justSent,
  onChange,
}: {
  view: RsvpView;
  events: RsvpEvent[];
  justSent: boolean;
  onChange: () => void;
}) {
  const attending = events.filter((e) => e.rsvp_status === "attending");
  const pending = events.filter((e) => e.rsvp_status === "pending");
  return (
    <div className="rsvp-confirmation" role={justSent ? "status" : undefined}>
      <h2 id="rsvp-reply-title">{justSent ? `Thank you, ${view.first_name}!` : "Your reply"}</h2>
      <p className="rsvp-lead">
        {attending.length > 0
          ? `${view.couple_names} can't wait to celebrate with you.`
          : pending.length > 0
            ? "You still have an invitation to answer."
            : `You'll be missed. Thank you for letting ${view.couple_names} know.`}
      </p>
      <ul className="rsvp-summary">
        {events.map((e) => (
          <li key={e.event_id}>
            <span className="rsvp-summary-event">{e.name}</span>
            <span className={`rsvp-summary-answer ${e.rsvp_status}`}>
              {e.rsvp_status === "attending"
                ? e.plus_one_attending
                  ? `Attending with ${e.plus_one_name || "a guest"}`
                  : "Attending"
                : e.rsvp_status === "declined"
                  ? "Not attending"
                  : "Not answered yet"}
            </span>
          </li>
        ))}
      </ul>
      {view.dietary_requirements && attending.length > 0 && (
        <p className="rsvp-small">Dietary requirements: {view.dietary_requirements}</p>
      )}
      {view.message && <p className="rsvp-small rsvp-quote">“{view.message}”</p>}
      <p className="rsvp-small">Plans change? You can update your reply here at any time.</p>
      <button type="button" className={pending.length > 0 ? "rsvp-btn" : "rsvp-btn-ghost"} onClick={onChange}>
        {pending.length > 0 ? "Reply now" : "Change my reply"}
      </button>
    </div>
  );
}
