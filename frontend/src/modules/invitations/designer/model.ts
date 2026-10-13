// Design document helpers: validation ranges (mirroring design.py), clamping,
// layer factories and immutable layer operations.
import { findFont, nearestWeight, pickFont } from "./fonts";
import type {
  CardBackground,
  EmailStyle,
  EnvelopeStyle,
  FontOption,
  ImageLayer,
  InvitationDesign,
  Layer,
  TextLayer,
} from "./types";
import { DESIGN_WIDTH_PX } from "./types";

export const MAX_LAYERS = 60;
export const MAX_TEXT = 2000;
export const MAX_BUTTON_TEXT = 60;
export const MAX_HINT = 60;
export const MAX_INITIALS = 5;
export const MAX_STAMP = 6;
export const MAX_ID = 40;
/** Smallest width the designer produces (the API only needs > 0). */
export const MIN_WIDTH = 1;

export const RANGES = {
  position: { min: -50, max: 150 },
  width: { min: MIN_WIDTH, max: 200 },
  rotation: { min: -180, max: 180 },
  opacity: { min: 0, max: 1 },
  fontSize: { min: 4, max: 200 },
  fontWeight: { min: 100, max: 900 },
  lineHeight: { min: 0.6, max: 3 },
  letterSpacing: { min: -0.2, max: 1 },
  borderRadius: { min: 0, max: 50 },
  aspectRatio: { min: 0.5, max: 2 },
} as const;

export const DEFAULT_TEXT_COLOR = "#3b302a";
export const DEFAULT_BACKGROUND = "#fbf7f2";
export const DEFAULT_EMAIL: EmailStyle = {
  header_asset_id: null,
  background_color: "#f6f1eb",
  card_color: "#ffffff",
  text_color: "#3b302a",
  accent_color: "#7a5c4f",
  font_family: "Cormorant Garamond",
  button_text: "View your invitation",
};

export const DEFAULT_ENVELOPE: EnvelopeStyle = {
  enabled: true,
  paper_color: null,
  seal_color: null,
  ink_color: "#1f5436",
  initials: "",
  stamp_text: "",
  hint: "Break the seal to open",
};

export interface ShapePreset {
  id: string;
  label: string;
  detail: string;
  ratio: number;
}

export const SHAPE_PRESETS: ShapePreset[] = [
  { id: "portrait", label: "Portrait", detail: "5×7", ratio: 1.4 },
  { id: "square", label: "Square", detail: "1:1", ratio: 1 },
  { id: "landscape", label: "Landscape", detail: "7×5", ratio: 0.714 },
  { id: "tall", label: "Tall", detail: "Slim", ratio: 1.6 },
];

export function shapePresetFor(ratio: number): ShapePreset | undefined {
  return SHAPE_PRESETS.find((p) => Math.abs(p.ratio - ratio) < 0.006);
}

// ---------------------------------------------------------------------------
// Numbers and colours

export function clamp(value: number, min: number, max: number, fallback: number = min): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  const result = Math.round(value * factor) / factor;
  return result === 0 ? 0 : result; // no -0
}

/** Clamp then round; the bounds are representable at `decimals`, so the result stays in range. */
export function clampRound(value: number, min: number, max: number, decimals = 2, fallback = min): number {
  return round(clamp(value, min, max, fallback), decimals);
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX6.test(value);
}

/** Parse user input like "#abc", "aabbcc" or "#AABBCC" into "#aabbcc"; null if invalid. */
export function parseHex(input: string): string | null {
  const s = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s
      .split("")
      .map((c) => c + c)
      .join("")
      .toLowerCase()}`;
  }
  return null;
}

/** Truncate to at most `max` characters (code points, as the API counts them). */
export function truncateChars(text: string, max: number): string {
  if (text.length <= max) return text;
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join("");
}

export function charCount(text: string): number {
  return Array.from(text).length;
}

// ---------------------------------------------------------------------------
// Ids

export function newLayerId(prefix: string, taken: ReadonlySet<string>): string {
  for (;;) {
    const suffix = (Math.random().toString(36) + "000000").slice(2, 8);
    const id = `${prefix}-${suffix}`;
    if (!taken.has(id)) return id;
  }
}

export function layerIdSet(design: InvitationDesign): Set<string> {
  return new Set(design.layers.map((l) => l.id));
}

// ---------------------------------------------------------------------------
// Normalisation: keep every design inside the API's validation rules.

interface NormalizeContext {
  families: Set<string> | null;
  fallbackFamily: string;
}

function normalizeContext(fonts: readonly FontOption[]): NormalizeContext {
  return {
    families: fonts.length ? new Set(fonts.map((f) => f.family)) : null,
    fallbackFamily: pickFont(fonts, ["Cormorant Garamond", "EB Garamond", "Lora"], "serif"),
  };
}

function normalizeFamily(family: unknown, ctx: NormalizeContext): string {
  if (typeof family !== "string" || !family) return ctx.fallbackFamily;
  if (ctx.families && !ctx.families.has(family)) return ctx.fallbackFamily;
  return family;
}

const ALIGNS = ["left", "center", "right"] as const;

/** `original` if `next` has the same keys and values (keeps object identity for memoisation). */
function keepIfSame<T extends object>(original: T, next: T): T {
  const a = original as Record<string, unknown>;
  const b = next as Record<string, unknown>;
  const keys = Object.keys(b);
  if (keys.length !== Object.keys(a).length) return next;
  return keys.every((k) => Object.is(a[k], b[k])) ? original : next;
}

export function normalizeLayer(layer: Layer, ctx: NormalizeContext): Layer {
  const placed = {
    id: layer.id,
    x: clamp(layer.x, RANGES.position.min, RANGES.position.max, 0),
    y: clamp(layer.y, RANGES.position.min, RANGES.position.max, 0),
    width: clamp(layer.width, RANGES.width.min, RANGES.width.max, 50),
    rotation: clamp(layer.rotation, RANGES.rotation.min, RANGES.rotation.max, 0),
    opacity: clamp(layer.opacity, RANGES.opacity.min, RANGES.opacity.max, 1),
  };
  if (layer.type === "image") {
    const image: ImageLayer = {
      ...layer,
      ...placed,
      type: "image",
      asset_id: String(layer.asset_id),
      border_radius: clamp(layer.border_radius, RANGES.borderRadius.min, RANGES.borderRadius.max, 0),
    };
    return keepIfSame<Layer>(layer, image);
  }
  const text: TextLayer = {
    ...layer,
    ...placed,
    type: "text",
    text: typeof layer.text === "string" ? truncateChars(layer.text, MAX_TEXT) : "",
    font_family: normalizeFamily(layer.font_family, ctx),
    font_size: clamp(layer.font_size, RANGES.fontSize.min, RANGES.fontSize.max, 18),
    font_weight: Math.round(clamp(layer.font_weight, RANGES.fontWeight.min, RANGES.fontWeight.max, 400)),
    italic: Boolean(layer.italic),
    color: isHex(layer.color) ? layer.color : DEFAULT_TEXT_COLOR,
    align: ALIGNS.includes(layer.align) ? layer.align : "center",
    line_height: clamp(layer.line_height, RANGES.lineHeight.min, RANGES.lineHeight.max, 1.3),
    letter_spacing: clamp(layer.letter_spacing, RANGES.letterSpacing.min, RANGES.letterSpacing.max, 0),
    uppercase: Boolean(layer.uppercase),
  };
  return keepIfSame<Layer>(layer, text);
}

export function normalizeBackground(bg: CardBackground): CardBackground {
  const next: CardBackground = {
    color: isHex(bg?.color) ? bg.color : DEFAULT_BACKGROUND,
    image_asset_id: bg?.image_asset_id ? String(bg.image_asset_id) : null,
    image_fit: bg?.image_fit === "contain" ? "contain" : "cover",
    image_opacity: clamp(bg?.image_opacity, 0, 1, 1),
    border_color: isHex(bg?.border_color) ? bg.border_color : null,
  };
  return bg ? keepIfSame(bg, next) : next;
}

export function normalizeEmail(email: EmailStyle, fonts: readonly FontOption[]): EmailStyle {
  const ctx = normalizeContext(fonts);
  const e = email ?? DEFAULT_EMAIL;
  const button = typeof e.button_text === "string" ? truncateChars(e.button_text, MAX_BUTTON_TEXT) : "";
  const family =
    typeof e.font_family === "string" && (!ctx.families || ctx.families.has(e.font_family))
      ? e.font_family
      : pickFont(fonts, [DEFAULT_EMAIL.font_family], "serif");
  const next: EmailStyle = {
    header_asset_id: e.header_asset_id ? String(e.header_asset_id) : null,
    background_color: isHex(e.background_color) ? e.background_color : DEFAULT_EMAIL.background_color,
    card_color: isHex(e.card_color) ? e.card_color : DEFAULT_EMAIL.card_color,
    text_color: isHex(e.text_color) ? e.text_color : DEFAULT_EMAIL.text_color,
    accent_color: isHex(e.accent_color) ? e.accent_color : DEFAULT_EMAIL.accent_color,
    font_family: family,
    button_text: button.trim() ? button : DEFAULT_EMAIL.button_text,
  };
  return keepIfSame(e, next);
}

export function normalizeEnvelope(envelope: EnvelopeStyle | undefined): EnvelopeStyle {
  const e = envelope ?? DEFAULT_ENVELOPE;
  const hint = typeof e.hint === "string" ? truncateChars(e.hint, MAX_HINT) : "";
  const next: EnvelopeStyle = {
    enabled: e.enabled !== false,
    paper_color: isHex(e.paper_color) ? e.paper_color : null,
    seal_color: isHex(e.seal_color) ? e.seal_color : null,
    ink_color: isHex(e.ink_color) ? e.ink_color : DEFAULT_ENVELOPE.ink_color,
    initials: typeof e.initials === "string" ? truncateChars(e.initials, MAX_INITIALS) : "",
    stamp_text: typeof e.stamp_text === "string" ? truncateChars(e.stamp_text, MAX_STAMP) : "",
    hint: hint.trim() ? hint : DEFAULT_ENVELOPE.hint,
  };
  return envelope ? keepIfSame(envelope, next) : next;
}

/**
 * Return a design the API accepts: every number clamped to its range, colours valid,
 * fonts from the catalog, at most 60 layers with unique 1-40 character ids.
 * Valid values are left untouched (no rounding), so this is idempotent.
 */
export function normalizeDesign(design: InvitationDesign, fonts: readonly FontOption[]): InvitationDesign {
  const ctx = normalizeContext(fonts);
  const source = Array.isArray(design.layers) ? design.layers : [];
  const known = source.filter((l): l is Layer => !!l && (l.type === "text" || l.type === "image"));
  const taken = new Set(known.map((l) => l.id));
  const seen = new Set<string>();
  const layers = known.slice(0, MAX_LAYERS).map((raw) => {
    const layer = normalizeLayer(raw, ctx);
    const id = layer.id;
    if (typeof id !== "string" || id.length < 1 || id.length > MAX_ID || seen.has(id)) {
      const fresh = newLayerId(layer.type === "text" ? "t" : "i", taken);
      taken.add(fresh);
      seen.add(fresh);
      return { ...layer, id: fresh };
    }
    seen.add(id);
    return layer;
  });
  const sameLayers = layers.length === source.length && layers.every((l, i) => l === source[i]);
  const next: InvitationDesign = {
    version: 1,
    aspect_ratio: clamp(design.aspect_ratio, RANGES.aspectRatio.min, RANGES.aspectRatio.max, 1.4),
    background: normalizeBackground(design.background),
    layers: sameLayers ? design.layers : layers,
    email: normalizeEmail(design.email, fonts),
    envelope: normalizeEnvelope(design.envelope),
  };
  return keepIfSame(design, next);
}

/** Snap a text layer's weight/italic to what its font supports. */
export function fitToFont(layer: TextLayer, fonts: readonly FontOption[]): TextLayer {
  const font = findFont(fonts, layer.font_family);
  if (!font) return layer;
  const weight = nearestWeight(font.weights, layer.font_weight);
  const italic = layer.italic && font.italic;
  if (weight === layer.font_weight && italic === layer.italic) return layer;
  return { ...layer, font_weight: weight, italic };
}

// ---------------------------------------------------------------------------
// Immutable layer operations

export type LayerPatch = Partial<Omit<TextLayer, "type" | "id">> & Partial<Omit<ImageLayer, "type" | "id">>;

export function findLayer(design: InvitationDesign, id: string | null | undefined): Layer | undefined {
  if (!id) return undefined;
  return design.layers.find((l) => l.id === id);
}

export function mapLayer(design: InvitationDesign, id: string, fn: (layer: Layer) => Layer): InvitationDesign {
  let changed = false;
  const layers = design.layers.map((l) => {
    if (l.id !== id) return l;
    const next = fn(l);
    if (next !== l) changed = true;
    return next;
  });
  return changed ? { ...design, layers } : design;
}

/** Apply the patch's keys that the layer actually has; returns the same design if nothing changes. */
export function patchLayer(design: InvitationDesign, id: string, patch: LayerPatch): InvitationDesign {
  return mapLayer(design, id, (layer) => {
    const record = layer as unknown as Record<string, unknown>;
    let next: Record<string, unknown> | null = null;
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || !(key in record) || record[key] === value) continue;
      next ??= { ...record };
      next[key] = value;
    }
    return next ? (next as unknown as Layer) : layer;
  });
}

export function replaceLayer(design: InvitationDesign, layer: Layer): InvitationDesign {
  return mapLayer(design, layer.id, () => layer);
}

export function removeLayer(design: InvitationDesign, id: string): InvitationDesign {
  const layers = design.layers.filter((l) => l.id !== id);
  return layers.length === design.layers.length ? design : { ...design, layers };
}

export function addLayer(design: InvitationDesign, layer: Layer, index = design.layers.length): InvitationDesign {
  if (design.layers.length >= MAX_LAYERS) return design;
  const layers = design.layers.slice();
  layers.splice(index, 0, layer);
  return { ...design, layers };
}

export function duplicateLayer(design: InvitationDesign, id: string): { design: InvitationDesign; id: string | null } {
  const index = design.layers.findIndex((l) => l.id === id);
  if (index < 0 || design.layers.length >= MAX_LAYERS) return { design, id: null };
  const source = design.layers[index];
  const copyId = newLayerId(source.type === "text" ? "t" : "i", layerIdSet(design));
  const copy: Layer = {
    ...source,
    id: copyId,
    x: clampRound(source.x + 2, RANGES.position.min, RANGES.position.max),
    y: clampRound(source.y + 2, RANGES.position.min, RANGES.position.max),
  };
  return { design: addLayer(design, copy, index + 1), id: copyId };
}

/** Move a layer up (+1, towards the front) or down (-1) the paint order. */
export function shiftLayer(design: InvitationDesign, id: string, delta: number): InvitationDesign {
  const index = design.layers.findIndex((l) => l.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= design.layers.length) return design;
  const layers = design.layers.slice();
  const [layer] = layers.splice(index, 1);
  layers.splice(target, 0, layer);
  return { ...design, layers };
}

/** Move a layer to array index `to` (after removal). */
export function moveLayerTo(design: InvitationDesign, id: string, to: number): InvitationDesign {
  const index = design.layers.findIndex((l) => l.id === id);
  if (index < 0) return design;
  const target = Math.max(0, Math.min(design.layers.length - 1, to));
  if (target === index) return design;
  const layers = design.layers.slice();
  const [layer] = layers.splice(index, 1);
  layers.splice(target, 0, layer);
  return { ...design, layers };
}

// ---------------------------------------------------------------------------
// Factories

function mostUsedTextColor(design: InvitationDesign): string {
  const counts = new Map<string, number>();
  for (const l of design.layers) {
    if (l.type === "text") counts.set(l.color, (counts.get(l.color) ?? 0) + 1);
  }
  let best = DEFAULT_TEXT_COLOR;
  let max = 0;
  for (const [color, n] of counts) {
    if (n > max) {
      best = color;
      max = n;
    }
  }
  return best;
}

/** Nudge a new layer's position so it doesn't sit exactly on top of an existing one. */
function freeSpot(design: InvitationDesign, x: number, y: number): { x: number; y: number } {
  let ny = y;
  let nx = x;
  for (let i = 0; i < 20; i++) {
    const clash = design.layers.some((l) => Math.abs(l.x - nx) < 0.75 && Math.abs(l.y - ny) < 0.75);
    if (!clash) break;
    nx += 2;
    ny += 3;
  }
  return {
    x: clampRound(nx, RANGES.position.min, RANGES.position.max),
    y: clampRound(ny, RANGES.position.min, RANGES.position.max),
  };
}

export function createTextLayer(
  design: InvitationDesign,
  fonts: readonly FontOption[],
  kind: "heading" | "text",
): TextLayer {
  const heading = kind === "heading";
  const family = heading
    ? pickFont(fonts, ["Playfair Display", "Cormorant Garamond"], "serif")
    : pickFont(fonts, ["Cormorant Garamond", "EB Garamond", "Lora"], "serif");
  const fontSize = heading ? 44 : 20;
  const lineHeight = heading ? 1.15 : 1.4;
  // One line of text, centred vertically on the card.
  const heightPct = ((fontSize * lineHeight) / (DESIGN_WIDTH_PX * design.aspect_ratio)) * 100;
  const spot = freeSpot(design, 10, 50 - heightPct / 2);
  const layer: TextLayer = {
    id: newLayerId("t", layerIdSet(design)),
    type: "text",
    text: heading ? "Your heading" : "Add a little text here",
    x: spot.x,
    y: spot.y,
    width: 80,
    rotation: 0,
    opacity: 1,
    font_family: family,
    font_size: fontSize,
    font_weight: 400,
    italic: false,
    color: mostUsedTextColor(design),
    align: "center",
    line_height: lineHeight,
    letter_spacing: 0,
    uppercase: false,
  };
  return fitToFont(layer, fonts);
}

/** `imageAspect` is the image's height / width when known. */
export function createImageLayer(design: InvitationDesign, assetId: string, imageAspect: number | null): ImageLayer {
  const width = 40;
  const heightPct = (width * (imageAspect ?? 1)) / design.aspect_ratio;
  const spot = freeSpot(design, 50 - width / 2, Math.max(4, 50 - heightPct / 2));
  return {
    id: newLayerId("i", layerIdSet(design)),
    type: "image",
    asset_id: assetId,
    x: spot.x,
    y: spot.y,
    width,
    rotation: 0,
    opacity: 1,
    border_radius: 0,
  };
}

// ---------------------------------------------------------------------------
// Misc

const DEFAULT_SWATCHES = [
  "#3b302a",
  "#8a7566",
  "#fbf7f2",
  "#ffffff",
  "#b08d57",
  "#d9c6b3",
  "#c98f8a",
  "#9caf88",
  "#1f2a44",
  "#000000",
];

/** The design's own colours first, then a few tasteful defaults. */
export function designSwatches(design: InvitationDesign, extra: readonly string[] = [], limit = 12): string[] {
  const out: string[] = [];
  const add = (c: string | null | undefined) => {
    if (!c || !isHex(c)) return;
    const v = c.toLowerCase();
    if (!out.includes(v)) out.push(v);
  };
  extra.forEach(add);
  add(design.background.color);
  add(design.background.border_color);
  design.layers.forEach((l) => l.type === "text" && add(l.color));
  DEFAULT_SWATCHES.forEach(add);
  return out.slice(0, limit);
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra);
  if (ka.length !== Object.keys(rb).length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(rb, k) && deepEqual(ra[k], rb[k]));
}

/** Short human label for a layer (layer list, announcements). */
export function layerLabel(layer: Layer, assetName?: string): string {
  if (layer.type === "image") return assetName || "Image";
  const first = layer.text.split("\n").find((line) => line.trim()) ?? "";
  return first.trim() || "Empty text";
}
