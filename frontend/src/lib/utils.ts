/** Join class names, skipping falsy values. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Copy text to the clipboard, with a fallback for older browsers / insecure origins. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("Couldn't copy to the clipboard");
}

/** The public RSVP page for a guest. */
export function rsvpLink(rsvpToken: string): string {
  return `${window.location.origin}/rsvp/${rsvpToken}`;
}

/** Case- and accent-insensitive "contains". */
export function matches(haystack: (string | null | undefined)[], needle: string): boolean {
  const n = normalize(needle.trim());
  if (!n) return true;
  return haystack.some((h) => h && normalize(h).includes(n));
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}


/** Structural equality for plain JSON data (key order doesn't matter). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const otherKeys = Object.keys(bo).filter((k) => bo[k] !== undefined);
  return keys.length === otherKeys.length && keys.every((k) => deepEqual(ao[k], bo[k]));
}
