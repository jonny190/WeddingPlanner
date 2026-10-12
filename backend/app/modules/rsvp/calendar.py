"""Calendar entries for a guest's invitations.

Two ways to get an event into a guest's own calendar, both built from what the couple entered:

* a downloadable .ics file, which any phone or computer offers to add, carrying three reminders —
  a week before, the day before, and two hours before;
* links that pre-fill a new entry in Google Calendar or Outlook for guests who prefer that.

Event times are wall-clock at the venue and stored without a timezone, so the entries are written
with *floating* times: a guest travelling from elsewhere still sees the hour it happens on the day.
An event with no time at all — the day itself, typically — becomes an all-day entry on the date.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from urllib.parse import urlencode

from app.modules.weddings.models import Event, EventKind, Wedding

# A UID needs a domain, not just an id, and must stay the same every time a guest downloads the
# file: that way a second download updates their existing entry instead of adding a duplicate.
UID_DOMAIN = "wedding-planner.daveys.xyz"

# Reminders in the downloaded file: how long before the start, and what the reminder says.
REMINDERS: tuple[tuple[timedelta, str], ...] = (
    (timedelta(days=7), "One week to go"),
    (timedelta(days=1), "Tomorrow"),
    (timedelta(hours=2), "Starting in two hours"),
)

# Used when the couple have not said when an event ends.
DEFAULT_DURATION = timedelta(hours=3)

# Mirrors the mount in app.main; the calendar link is checked end to end by the RSVP tests.
PUBLIC_RSVP_BASE = "/api/v1/public/rsvp"


@dataclass(frozen=True)
class CalendarEntry:
    """One event, in the shape the three kinds of link all need."""

    uid: str
    summary: str
    location: str
    description: str
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    all_day: date | None = None

    @property
    def is_all_day(self) -> bool:
        return self.all_day is not None

    def timed(self) -> tuple[datetime, datetime]:
        """Start and end of a timed entry. Only call this when it is not all-day."""
        assert self.starts_at is not None and self.ends_at is not None
        return self.starts_at, self.ends_at

    def day(self) -> date:
        """The date of an all-day entry. Only call this when it is all-day."""
        assert self.all_day is not None
        return self.all_day


def _escape(text: str) -> str:
    """Escape the characters an .ics text value cannot carry as they stand."""
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
    )


def _fold(line: str) -> str:
    """Fold a content line at 75 octets, continuing on a line that begins with a space."""
    if len(line.encode("utf-8")) <= 75:
        return line
    parts: list[bytes] = []
    current = b""
    for char in line:
        chunk = char.encode("utf-8")
        # 74, not 75: each continuation line gives up one octet to its leading space.
        if len(current) + len(chunk) > 74:
            parts.append(current)
            current = chunk
        else:
            current += chunk
    parts.append(current)
    return "\r\n ".join(part.decode("utf-8") for part in parts)


def floating(value: datetime) -> str:
    """A timestamp with no timezone, as calendar clients want a venue-local time."""
    return value.strftime("%Y%m%dT%H%M%S")


def _day_after(value: date) -> date:
    return value + timedelta(days=1)


def _trigger(offset: timedelta) -> str:
    if offset.seconds == 0 and offset.days:
        return f"-P{offset.days}D"
    return f"-PT{int(offset.total_seconds() // 3600)}H"


def _venue(event: Event) -> str:
    return ", ".join(part for part in (event.venue_name, event.venue_address) if part)


def entry_for(
    event: Event,
    wedding: Wedding,
    *,
    detail_url: str | None = None,
) -> CalendarEntry | None:
    """The calendar entry for one event, or None when there is no date to build one from."""
    if event.starts_at is not None:
        starts_at = event.starts_at
        ends_at = event.ends_at or starts_at + DEFAULT_DURATION
        all_day = None
    elif event.kind is EventKind.day and wedding.wedding_date is not None:
        # No time given for the day itself: an all-day entry on the wedding date.
        starts_at = ends_at = None
        all_day = wedding.wedding_date
    else:
        return None

    description = "\n\n".join(
        part
        for part in (event.details, f"Your invitation: {detail_url}" if detail_url else None)
        if part
    )
    return CalendarEntry(
        uid=f"{event.id}@{UID_DOMAIN}",
        summary=f"{wedding.couple_names} — {event.name}",
        location=_venue(event),
        description=description,
        starts_at=starts_at,
        ends_at=ends_at,
        all_day=all_day,
    )


def ics_url(public_app_url: str, token: str, event_id: uuid.UUID) -> str:
    """Where that event can be downloaded as a calendar file."""
    return f"{public_app_url.rstrip('/')}{PUBLIC_RSVP_BASE}/{token}/calendar.ics?event={event_id}"


def google_url(entry: CalendarEntry) -> str:
    """A Google Calendar link that opens with the entry already filled in."""
    if entry.is_all_day:
        dates = f"{entry.day():%Y%m%d}/{_day_after(entry.day()):%Y%m%d}"
    else:
        starts_at, ends_at = entry.timed()
        dates = f"{floating(starts_at)}/{floating(ends_at)}"
    params = {"action": "TEMPLATE", "text": entry.summary, "dates": dates}
    if entry.location:
        params["location"] = entry.location
    if entry.description:
        params["details"] = entry.description
    return "https://calendar.google.com/calendar/render?" + urlencode(params)


def outlook_url(entry: CalendarEntry) -> str:
    """An Outlook link that opens with the entry already filled in."""
    params = {"path": "/calendar/action/compose", "rru": "addevent", "subject": entry.summary}
    if entry.is_all_day:
        params |= {
            "allday": "true",
            "startdt": f"{entry.day():%Y-%m-%d}",
            "enddt": f"{_day_after(entry.day()):%Y-%m-%d}",
        }
    else:
        starts_at, ends_at = entry.timed()
        params |= {"startdt": starts_at.isoformat(), "enddt": ends_at.isoformat()}
    if entry.location:
        params["location"] = entry.location
    if entry.description:
        params["body"] = entry.description
    return "https://outlook.live.com/calendar/0/deeplink/compose?" + urlencode(params)


def build_ics(entries: list[CalendarEntry], *, stamp: datetime) -> str:
    """One calendar file holding every entry, each with its three reminders."""
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Wedding Planner//Guest invitation//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]
    for entry in entries:
        lines += ["BEGIN:VEVENT", f"UID:{entry.uid}", f"DTSTAMP:{stamp.strftime('%Y%m%dT%H%M%SZ')}"]
        if entry.is_all_day:
            lines += [
                f"DTSTART;VALUE=DATE:{entry.day():%Y%m%d}",
                f"DTEND;VALUE=DATE:{_day_after(entry.day()):%Y%m%d}",
            ]
        else:
            starts_at, ends_at = entry.timed()
            lines += [f"DTSTART:{floating(starts_at)}", f"DTEND:{floating(ends_at)}"]
        lines.append(f"SUMMARY:{_escape(entry.summary)}")
        if entry.location:
            lines.append(f"LOCATION:{_escape(entry.location)}")
        if entry.description:
            lines.append(f"DESCRIPTION:{_escape(entry.description)}")
        for offset, wording in REMINDERS:
            lines += [
                "BEGIN:VALARM",
                "ACTION:DISPLAY",
                f"TRIGGER:{_trigger(offset)}",
                f"DESCRIPTION:{_escape(f'{wording} — {entry.summary}')}",
                "END:VALARM",
            ]
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"


def filename_for(entries: list[CalendarEntry], event: Event | None) -> str:
    """A friendly download name: the event's own, or the wedding as a whole."""
    if event is not None:
        slug = "".join(c if c.isalnum() else "-" for c in event.name.lower()).strip("-")
        slug = "-".join(part for part in slug.split("-") if part)
        if slug:
            return f"{slug}.ics"
    return "wedding.ics"
