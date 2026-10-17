"""Turns an invitation draft into the personalised email each guest receives.

Drafts use ``{{placeholder}}`` markers from a fixed list; nothing else in the
template is interpreted, so user-written templates cannot run code.
"""

import html
import re
from dataclasses import dataclass
from datetime import date, datetime

from app.modules.invitations.design import FONTS, EmailStyle
from app.modules.weddings.models import Event, EventKind, Wedding

PLACEHOLDERS: dict[str, str] = {
    "first_name": "The guest's first name",
    "last_name": "The guest's last name",
    "full_name": "The guest's full name",
    "couple_names": "Both partners' names, e.g. 'Alex & Sam'",
    "event_name": "The event's name, e.g. 'Evening Reception'",
    "event_date": "The event date, e.g. 'Saturday 12 June 2027'",
    "event_time": "The start time, e.g. '7:00pm'",
    "event_when": "Date and time together, e.g. 'Saturday 12 June 2027 at 7:00pm'",
    "venue_name": "The venue's name",
    "venue_address": "The venue's address",
    "event_details": "Extra details from the event (dress code, parking, ...)",
    "rsvp_deadline": "The reply-by date",
    "plus_one": "A line inviting them to bring a guest; empty when they have no plus-one",
    "rsvp_link": "The guest's link to their invitation and reply form (a button in emails)",
    "calendar_link": "A link that adds the event, with the venue address, to the guest's calendar",
}

_PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z_]+)\s*\}\}")
_URL = re.compile(r"https?://[^\s<]+")


@dataclass(frozen=True)
class RenderedInvitation:
    subject: str
    text: str
    html: str
    unknown_placeholders: list[str]


def format_date(value: date | None) -> str:
    if value is None:
        return ""
    return f"{value:%A} {value.day} {value:%B %Y}"


def format_time(value: datetime | None) -> str:
    if value is None:
        return ""
    hour = value.hour % 12 or 12
    return f"{hour}:{value.minute:02d}{'am' if value.hour < 12 else 'pm'}"


def build_values(
    *,
    first_name: str,
    last_name: str,
    wedding: Wedding,
    event: Event,
    plus_one_allowed: bool,
    rsvp_url: str,
    calendar_url: str = "",
) -> dict[str, str]:
    event_date = event.starts_at.date() if event.starts_at else wedding.wedding_date
    when = " at ".join(p for p in (format_date(event_date), format_time(event.starts_at)) if p)
    return {
        "first_name": first_name,
        "last_name": last_name,
        "full_name": f"{first_name} {last_name}".strip(),
        "couple_names": wedding.couple_names,
        "event_name": event.name,
        "event_date": format_date(event_date),
        "event_time": format_time(event.starts_at),
        "event_when": when,
        "venue_name": event.venue_name or "",
        "venue_address": event.venue_address or "",
        "event_details": event.details or "",
        "rsvp_deadline": format_date(event.rsvp_deadline),
        "plus_one": "You are very welcome to bring a guest." if plus_one_allowed else "",
        "rsvp_link": rsvp_url,
        "calendar_link": calendar_url,
    }


def _substitute(template: str, values: dict[str, str], unknown: set[str]) -> str:
    def replace(match: re.Match) -> str:
        key = match.group(1).lower()
        if key in values:
            return values[key]
        unknown.add(key)
        return match.group(0)

    return _PLACEHOLDER.sub(replace, template)


def fill_placeholders(template: str, values: dict[str, str]) -> str:
    return _substitute(template, values, set())


def _to_html(text: str, rsvp_url: str, style: EmailStyle, header_image_url: str | None) -> str:
    font = FONTS[style.font_family].fallback
    button_font = FONTS["Montserrat"].fallback
    accent = style.accent_color

    def linkify(line: str) -> str:
        parts, last = [], 0
        for match in _URL.finditer(line):
            parts.append(html.escape(line[last : match.start()]))
            url = html.escape(match.group(0))
            if match.group(0) == rsvp_url:
                parts.append(
                    f'<a href="{url}" style="display:inline-block;margin:6px 0;padding:13px 30px;'
                    f"background:{accent};color:#ffffff;text-decoration:none;border-radius:999px;"
                    f"font-family:{button_font};"
                    'font-size:14px;letter-spacing:0.06em">'
                    f"{html.escape(style.button_text)}</a>"
                )
            else:
                parts.append(f'<a href="{url}" style="color:{accent}">{url}</a>')
            last = match.end()
        parts.append(html.escape(line[last:]))
        return "".join(parts)

    paragraphs = [p for p in re.split(r"\n\s*\n", text.strip()) if p.strip()]
    body = "".join(
        '<p style="margin:0 0 18px;line-height:1.6">'
        f"{'<br>'.join(linkify(line) for line in p.splitlines())}</p>"
        for p in paragraphs
    )
    header = (
        f'<img src="{html.escape(header_image_url)}" alt="" width="560" '
        'style="display:block;width:100%;max-width:560px;height:auto;border:0;'
        'border-radius:12px 12px 0 0">'
        if header_image_url
        else ""
    )
    card_radius = "0 0 12px 12px" if header_image_url else "12px"
    return (
        f'<!doctype html><html><body style="margin:0;background:{style.background_color};'
        f'font-family:{font};color:{style.text_color};font-size:17px">'
        '<div style="max-width:560px;margin:0 auto;padding:32px 16px">'
        f"{header}"
        f'<div style="background:{style.card_color};border-radius:{card_radius};'
        f'padding:32px 28px;text-align:center">{body}</div></div></body></html>'
    )


def render_invitation(
    subject: str,
    body: str,
    values: dict[str, str],
    style: EmailStyle | None = None,
    header_image_url: str | None = None,
) -> RenderedInvitation:
    if "rsvp_link" not in {m.group(1).lower() for m in _PLACEHOLDER.finditer(body)}:
        # Every invitation must carry the guest's reply link.
        body = f"{body.rstrip()}\n\n{{{{rsvp_link}}}}"
    unknown: set[str] = set()
    rendered_subject = " ".join(_substitute(subject, values, unknown).split())
    text = _substitute(body, values, unknown)
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(line.rstrip() for line in text.splitlines()))
    return RenderedInvitation(
        subject=rendered_subject,
        text=text.strip() + "\n",
        html=_to_html(text, values.get("rsvp_link", ""), style or EmailStyle(), header_image_url),
        unknown_placeholders=sorted(unknown),
    )


def default_draft(event: Event) -> tuple[str, str]:
    """A sensible starting point for a new draft, tailored to the kind of event."""
    if event.kind == EventKind.evening:
        subject = "Join {{couple_names}} for their evening reception"
        opening = "{{couple_names}} would love you to join them for their evening celebrations."
    else:
        subject = "You're invited to the wedding of {{couple_names}}"
        opening = "{{couple_names}} would love you to join them on their wedding day."
    reply = "Open your invitation for all the details, and let us know if you can make it"
    reply += " by {{rsvp_deadline}}" if event.rsvp_deadline else ""
    body = (
        "Dear {{first_name}},\n\n"
        f"{opening}\n\n"
        "{{event_name}}\n{{event_when}}\n{{venue_name}}\n{{venue_address}}\n\n"
        "{{plus_one}}\n\n"
        f"{reply}.\n\n{{{{rsvp_link}}}}\n\n"
        "Add it to your calendar: {{calendar_link}}\n\n"
        "With love,\n{{couple_names}}"
    )
    return subject, body
