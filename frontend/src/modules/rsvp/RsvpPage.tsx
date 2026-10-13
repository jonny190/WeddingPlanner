import { useMemo, useState, type CSSProperties } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { assetUrl, isApiError } from "../../api/client";
import type { RsvpEvent, RsvpView } from "../../api/types";
import { daysUntil, formatDate, formatLongDate, formatTime, parseDate, parseWallClock } from "../../lib/format";
import { CardRenderer } from "../invitations/designer";
import { useRsvpView } from "./api";
import { EnvelopeReveal, sealInitials, shouldReveal } from "./EnvelopeReveal";
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

  // The invitations arrive as one sealed envelope, once per visit.
  const firstEventId = events[0]?.event_id ?? "";
  const sealed = useMemo(
    () => (firstEventId ? shouldReveal(`${token}:${firstEventId}`) : false),
    [token, firstEventId],
  );

  if (events.length === 0) {
    return (
      <article className="rsvp">
        <header className="rsvp-hero">
          <p className="rsvp-eyebrow">The wedding of</p>
          <h1 className="rsvp-couple">{view.couple_names}</h1>
          {view.wedding_date && <p className="rsvp-date">{formatLongDate(parseDate(view.wedding_date))}</p>}
          <div className="rsvp-flourish" aria-hidden="true" />
          <p className="rsvp-greeting">Dear {view.first_name},</p>
        </header>
        <section className="rsvp-panel rsvp-center">
          <h2>Nothing to reply to yet</h2>
          <p>
            {view.couple_names} haven't sent your invitation yet. Once they do, you'll find it here, along with a way
            to let them know if you can come.
          </p>
        </section>
      </article>
    );
  }

  // The letter is written on the first card's paper, inside its frame, in its colours. The envelope
  // is dressed to match: the card's accent for the wax, a deeper shade of its paper for the envelope.
  const firstCard = events[0].card;
  const letterStyle = {
    "--letter-paper": firstCard.background.color,
    "--letter-frame": firstCard.background.border_color ?? "transparent",
    "--c-accent": firstCard.email.accent_color,
  } as CSSProperties;
  const initials = sealInitials(view.couple_names);
  const withCalendar = events.filter((e) => e.calendar);
  const weddingDate = view.wedding_date ? formatLongDate(parseDate(view.wedding_date)) : null;
  const addressLines = [view.full_name, `The wedding of ${view.couple_names}`, ...(weddingDate ? [weddingDate] : [])];

  return (
    <article className="rsvp">
      <EnvelopeReveal
        play={sealed}
        initials={initials}
        addressLines={addressLines}
        sealColor={firstCard.email.accent_color}
        paperColor={firstCard.background.color}
      >
        {/* One letter: the heading and crest, the couple's note, the printed invitation, their sign-off, and a reply slip. */}
        <div className="rsvp-sheet letter" style={letterStyle}>
          <header className="letter-head">
            <Crest initials={initials} />
            <p className="letter-eyebrow">The wedding of</p>
            <h1 className="letter-title">{view.couple_names}</h1>
            {weddingDate && <p className="letter-subline">{weddingDate}</p>}
          </header>
          <div className="letter-body">
            <p className="letter-greeting">Dear {view.first_name},</p>
            {events.map((e, i) => (
              <EventPassage key={e.event_id} event={e} view={view} first={i === 0} />
            ))}
            {deadline && <ReplyBy date={deadline} />}
            <p className="letter-close">With love,</p>
            <p className="letter-signature">{view.couple_names}</p>
            <p className="letter-signed">{view.couple_names}</p>
            {withCalendar.length > 0 && (
              <div className="letter-ps">
                <p>
                  P.S. So the day does not creep up on you, add it to your calendar. The first link suits any phone
                  or computer and sets a reminder a week, a day and two hours before.
                </p>
                <ul>
                  {withCalendar.map((e) => (
                    <li key={e.event_id}>
                      {withCalendar.length > 1 && <span className="letter-ps-event">{e.name}: </span>}
                      <a href={e.calendar!.ics_url}>Add to my calendar</a>
                      <span aria-hidden="true"> · </span>
                      <a href={e.calendar!.google_url} target="_blank" rel="noopener noreferrer">
                        Google Calendar
                      </a>
                      <span aria-hidden="true"> · </span>
                      <a href={e.calendar!.outlook_url} target="_blank" rel="noopener noreferrer">
                        Outlook
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <section className="rsvp-panel" aria-labelledby="rsvp-reply-title">
            {editing ? (
              <>
                <h2 id="rsvp-reply-title">{view.has_responded ? "Change your reply" : "Will you join us?"}</h2>
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
        </div>
      </EnvelopeReveal>
    </article>
  );
}

/** The couple's crest: their initials within a double ring, as a school or a house would have it. */
function Crest({ initials }: { initials: string }) {
  return (
    <svg className="letter-crest" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="60" cy="60" r="49" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="60" cy="60" r="36" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <path d="M60 8 l3 6 -3 6 -3 -6z M60 112 l3 -6 -3 -6 -3 6z M8 60 l6 3 6 -3 -6 -3z M112 60 l-6 3 -6 -3 6 -3z" fill="currentColor" />
      <text x="60" y="60" textAnchor="middle" dominantBaseline="central" fontSize="28" fontWeight="700" letterSpacing="2" fill="currentColor">
        {initials}
      </text>
    </svg>
  );
}

/** One event, written the way the couple would put it in a letter, with its printed card beneath. */
function EventPassage({ event, view, first }: { event: RsvpEvent; view: RsvpView; first: boolean }) {
  const starts = parseWallClock(event.starts_at);
  const ends = parseWallClock(event.ends_at);
  const where = [event.venue_name, event.venue_address?.replace(/\s*\n+\s*/g, ", ")].filter(Boolean).join(", ");
  const mapsUrl = event.venue_address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [event.venue_name, event.venue_address].filter(Boolean).join(", "),
      )}`
    : null;
  const opening = first
    ? `We would be delighted if you would join us for the ${event.name}`
    : `We would also love you to be with us for the ${event.name}`;
  return (
    <>
      <p>
        {opening}
        {starts && (
          <>
            {" on "}
            <strong>{formatLongDate(starts)}</strong>
            {" at "}
            {formatTime(starts)}
            {ends && ` until ${formatTime(ends)}`}
          </>
        )}
        {where && (
          <>
            {", at "}
            {where}
            {mapsUrl && (
              <>
                {" ("}
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                  map
                </a>
                {")"}
              </>
            )}
          </>
        )}
        .{event.plus_one_allowed && " You are very welcome to bring a guest."}
      </p>
      <div className="letter-card">
        <CardRenderer design={event.card} fonts={view.fonts} assetUrl={assetUrl} />
      </div>
      {event.details && <p className="letter-details">{event.details}</p>}
    </>
  );
}

function ReplyBy({ date }: { date: string }) {
  const days = daysUntil(date);
  const d = parseDate(date);
  return (
    <p className="rsvp-reply-by">
      {days !== null && days < 0
        ? `The reply-by date (${formatDate(d)}) has passed, but please still let the couple know.`
        : `We await your reply by no later than ${formatLongDate(d)}.`}
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
