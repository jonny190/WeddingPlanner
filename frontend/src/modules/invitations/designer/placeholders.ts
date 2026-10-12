// Client-side placeholder filling, matching the backend's `{{ name }}` syntax.

const PLACEHOLDER = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

/** Replace {{placeholder}} markers using `values`; unknown markers are left untouched. */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (match, key: string) => {
    const name = key.toLowerCase();
    // Own properties only, so markers such as {{constructor}} are never "known".
    if (!Object.prototype.hasOwnProperty.call(values, name)) return match;
    const value = values[name];
    return typeof value === "string" ? value : match;
  });
}

/** `{{name}}` marker for a placeholder name. */
export function placeholderToken(name: string): string {
  return `{{${name}}}`;
}
