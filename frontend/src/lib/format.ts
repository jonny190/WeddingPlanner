// Date helpers. Three kinds of value come from the API:
//  - dates ("2027-06-12"): calendar days, no time zone;
//  - event times ("2027-06-12T14:00:00"): naive wall-clock times at the venue;
//  - audit timestamps (created_at, sent_at, ...): UTC instants, sometimes without a "Z".

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** A calendar date (local midnight) from "YYYY-MM-DD" (or the date part of a date-time). */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** A naive wall-clock date-time, kept as the same wall-clock time locally (offsets are ignored). */
export function parseWallClock(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value);
  if (!m) return null;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0),
  );
}

/** A UTC instant; naive values are treated as UTC. */
export function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const d = new Date(hasZone ? value : `${value}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Saturday 12 June 2027" */
export function formatLongDate(d: Date | null): string {
  if (!d) return "";
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "12 June 2027" */
export function formatDate(d: Date | null): string {
  if (!d) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "12 Jun 2027" */
export function formatShortDate(d: Date | null): string {
  if (!d) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

/** "2:00pm" */
export function formatTime(d: Date | null): string {
  if (!d) return "";
  const hour = d.getHours() % 12 || 12;
  return `${hour}:${String(d.getMinutes()).padStart(2, "0")}${d.getHours() < 12 ? "am" : "pm"}`;
}

/** "Saturday 12 June 2027 at 2:00pm" */
export function formatWhen(d: Date | null): string {
  if (!d) return "";
  return `${formatLongDate(d)} at ${formatTime(d)}`;
}

/** Event time range: "Saturday 12 June 2027, 2:00pm – 11:00pm". */
export function formatEventWhen(startsAt: string | null, endsAt?: string | null): string {
  const start = parseWallClock(startsAt);
  if (!start) return "";
  const end = parseWallClock(endsAt ?? null);
  let text = `${formatLongDate(start)}, ${formatTime(start)}`;
  if (end) {
    const sameDay = end.toDateString() === start.toDateString();
    text += sameDay ? ` – ${formatTime(end)}` : ` – ${formatLongDate(end)}, ${formatTime(end)}`;
  }
  return text;
}

/** "12 Jun 2027, 14:05" for audit timestamps, in the viewer's time zone. */
export function formatDateTime(value: string | null | undefined): string {
  const d = parseInstant(value);
  if (!d) return "";
  return `${formatShortDate(d)}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const rtf =
  typeof Intl !== "undefined" && "RelativeTimeFormat" in Intl
    ? new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" })
    : null;

/** "5 minutes ago", "yesterday", "in 3 days" for audit timestamps. */
export function formatRelative(value: string | null | undefined, now: Date = new Date()): string {
  const d = parseInstant(value);
  if (!d) return "";
  const seconds = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86400],
    ["week", 604800],
    ["month", 2629800],
    ["year", 31557600],
  ];
  let unit: Intl.RelativeTimeFormatUnit = "minute";
  let size = 60;
  for (const [u, s] of units) {
    if (abs >= s * 0.9) {
      unit = u;
      size = s;
    }
  }
  const amount = Math.round(seconds / size);
  if (rtf) return rtf.format(amount, unit);
  return amount < 0 ? `${-amount} ${unit}s ago` : `in ${amount} ${unit}s`;
}

/** Whole days from today until a calendar date (negative once it has passed). */
export function daysUntil(dateValue: string | null | undefined, now: Date = new Date()): number | null {
  const d = parseDate(dateValue);
  if (!d) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

/** "124 days to go", "Tomorrow!", "Today!", "3 days ago". */
export function formatCountdown(dateValue: string | null | undefined): string {
  const days = daysUntil(dateValue);
  if (days === null) return "Date to be confirmed";
  if (days === 0) return "Today!";
  if (days === 1) return "Tomorrow!";
  if (days > 1) return `${days.toLocaleString("en-GB")} days to go`;
  if (days === -1) return "Yesterday";
  return `${(-days).toLocaleString("en-GB")} days ago`;
}

/** API wall-clock value -> <input type="datetime-local"> value ("2027-06-12T14:00"). */
export function toDateTimeInput(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(value);
  return m ? `${m[1]}T${m[2]}` : "";
}

/** <input type="datetime-local"> value -> naive API value ("2027-06-12T14:00:00"), or null. */
export function fromDateTimeInput(value: string): string | null {
  if (!value) return null;
  return value.length === 16 ? `${value}:00` : value;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? singular : plural}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function percent(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

/** Trim a string, returning null when empty (for optional API fields). */
export function orNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}
