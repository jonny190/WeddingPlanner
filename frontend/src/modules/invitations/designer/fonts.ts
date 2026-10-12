// Web font loading and font catalog helpers.
import { useEffect } from "react";
import type { FontCategory, FontOption } from "./types";

/** Families already requested from Google Fonts in this page (shared app-wide). */
const requestedFamilies = new Set<string>();
let preconnected = false;

/** Inject Google Fonts stylesheets for any families not requested yet. Idempotent. */
export function loadWebFonts(fonts: readonly FontOption[]): void {
  if (typeof document === "undefined") return;
  const pending: FontOption[] = [];
  for (const font of fonts) {
    if (!font || !font.google_spec || requestedFamilies.has(font.family)) continue;
    requestedFamilies.add(font.family);
    pending.push(font);
  }
  if (pending.length === 0) return;
  if (!preconnected) {
    preconnected = true;
    const pre = document.createElement("link");
    pre.rel = "preconnect";
    pre.href = "https://fonts.gstatic.com";
    pre.crossOrigin = "anonymous";
    document.head.appendChild(pre);
  }
  // Several families share one request; keep URLs a sensible length.
  for (let i = 0; i < pending.length; i += 12) {
    const chunk = pending.slice(i, i + 12);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${chunk
      .map((f) => `family=${f.google_spec}`)
      .join("&")}&display=swap`;
    link.dataset.dzFonts = chunk.map((f) => f.family).join(",");
    document.head.appendChild(link);
  }
}

/** Load Google Fonts for the given font options (idempotent, shared across the app). */
export function useWebFonts(fonts: FontOption[]): void {
  const key = fonts.map((f) => f.family).join("|");
  useEffect(() => {
    loadWebFonts(fonts);
    // `key` captures everything that matters about `fonts`.
  }, [key]);
}

const indexCache = new WeakMap<readonly FontOption[], Map<string, FontOption>>();

export function findFont(fonts: readonly FontOption[], family: string): FontOption | undefined {
  let index = indexCache.get(fonts);
  if (!index) {
    index = new Map(fonts.map((f) => [f.family, f]));
    indexCache.set(fonts, index);
  }
  return index.get(family);
}

/** The CSS font-family stack for a family: the catalog's fallback, or a safe guess. */
export function fontStack(family: string, fonts: readonly FontOption[]): string {
  const font = findFont(fonts, family);
  if (font) return font.fallback;
  const clean = family.replace(/["'\\;{}]/g, "").trim();
  return clean ? `'${clean}', Georgia, 'Times New Roman', serif` : "Georgia, 'Times New Roman', serif";
}

/** The stack without its first (web font) family: what most email clients show. */
export function fallbackOnlyStack(stack: string): string {
  const rest = stack.split(",").slice(1).join(",").trim();
  return rest || stack;
}

export function nearestWeight(weights: readonly number[], target: number): number {
  if (weights.length === 0) return Math.round(target);
  let best = weights[0];
  for (const w of weights) {
    if (Math.abs(w - target) < Math.abs(best - target)) best = w;
  }
  return best;
}

export const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin",
  200: "Extra light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra bold",
  900: "Black",
};

export function weightName(weight: number): string {
  return WEIGHT_NAMES[weight] ?? String(weight);
}

export const CATEGORY_ORDER: FontCategory[] = ["serif", "sans-serif", "script"];
export const CATEGORY_LABELS: Record<FontCategory, string> = {
  serif: "Serif",
  "sans-serif": "Sans serif",
  script: "Script",
};

export interface FontGroup {
  category: FontCategory;
  label: string;
  fonts: FontOption[];
}

export function groupFonts(fonts: readonly FontOption[]): FontGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    fonts: fonts.filter((f) => f.category === category),
  })).filter((g) => g.fonts.length > 0);
}

/**
 * The first preferred family the catalog offers, else the first font of `category`,
 * else the first font. With an empty catalog the first preference is returned as-is.
 */
export function pickFont(
  fonts: readonly FontOption[],
  preferred: readonly string[],
  category?: FontCategory,
): string {
  for (const family of preferred) {
    if (findFont(fonts, family)) return family;
  }
  const inCategory = category ? fonts.find((f) => f.category === category) : undefined;
  return inCategory?.family ?? fonts[0]?.family ?? preferred[0] ?? "Cormorant Garamond";
}
