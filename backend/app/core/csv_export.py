import csv
import io
from collections.abc import Iterable

# Spreadsheet apps treat cells starting with these as formulas. Guests can type into
# RSVP fields, so exported text is defused with a leading apostrophe.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _safe(value: object) -> object:
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value


def to_csv(header: list[str], rows: Iterable[Iterable[object]]) -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(header)
    for row in rows:
        writer.writerow([_safe(value) for value in row])
    return out.getvalue()
