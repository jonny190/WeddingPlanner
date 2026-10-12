// Pure geometry for direct manipulation: rotated bounds, snapping, resizing and
// rescaling layouts between card shapes. Pixel values are in card pixels with
// the origin at the card's top-left corner and y pointing down (screen space).
import { clampRound, MIN_WIDTH, RANGES } from "./model";
import type { ImageLayer, Layer, TextLayer } from "./types";

const DEG = Math.PI / 180;

/** A layer's untransformed layout box plus its rotation (degrees, clockwise). */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
}

/** Axis-aligned bounds of a (possibly rotated) box: edges and centre on each axis. */
export interface Bounds {
  x0: number;
  xc: number;
  x1: number;
  y0: number;
  yc: number;
  y1: number;
}

export function rotatedBounds(box: Box): Bounds {
  const t = box.rotation * DEG;
  const cos = Math.abs(Math.cos(t));
  const sin = Math.abs(Math.sin(t));
  const hx = (box.width * cos + box.height * sin) / 2;
  const hy = (box.width * sin + box.height * cos) / 2;
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  return { x0: cx - hx, xc: cx, x1: cx + hx, y0: cy - hy, yc: cy, y1: cy + hy };
}

export interface AxisSnap {
  /** Shift to apply to the moving lines. */
  delta: number;
  /** Target lines that the shifted lines now touch (for guides). */
  matched: number[];
}

/** Find the smallest shift (within `threshold`) that puts one of `lines` on one of `targets`. */
export function snapAxis(lines: readonly number[], targets: readonly number[], threshold: number): AxisSnap | null {
  let best: number | null = null;
  for (const m of lines) {
    for (const t of targets) {
      const d = t - m;
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  if (best === null) return null;
  const delta = best;
  const matched: number[] = [];
  for (const t of targets) {
    if (lines.some((m) => Math.abs(m + delta - t) < 0.5) && !matched.some((v) => Math.abs(v - t) < 0.5)) {
      matched.push(t);
    }
  }
  return { delta, matched };
}

export interface SnapResult {
  dx: number;
  dy: number;
  guidesX: number[];
  guidesY: number[];
}

export function snapBounds(
  bounds: Bounds,
  xTargets: readonly number[],
  yTargets: readonly number[],
  threshold: number,
  axes: { x: boolean; y: boolean } = { x: true, y: true },
): SnapResult {
  const sx = axes.x ? snapAxis([bounds.x0, bounds.xc, bounds.x1], xTargets, threshold) : null;
  const sy = axes.y ? snapAxis([bounds.y0, bounds.yc, bounds.y1], yTargets, threshold) : null;
  return {
    dx: sx?.delta ?? 0,
    dy: sy?.delta ?? 0,
    guidesX: sx?.matched ?? [],
    guidesY: sy?.matched ?? [],
  };
}

/** Snap target lines for a card of W x H: its edges and centre lines. */
export function cardTargets(W: number, H: number): { xs: number[]; ys: number[] } {
  return { xs: [0, W / 2, W], ys: [0, H / 2, H] };
}

function rotate(u: number, v: number, t: number): [number, number] {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [u * c - v * s, u * s + v * c];
}

/** Express a screen-space delta in the box's local (unrotated) axes. */
export function toLocal(dx: number, dy: number, rotation: number): [number, number] {
  return rotate(dx, dy, -rotation * DEG);
}

/**
 * New top-left of a box resized from (width, height) to (newWidth, newHeight) while
 * keeping the point at local anchor (ax, ay) fixed on screen. The anchor is in
 * half-extents: (-1, -1) is the top-left corner, (1, 0) the middle of the right edge.
 * Rotation is about the box's centre, as with `transform-origin: center`.
 */
export function resizeAnchored(
  box: Box,
  newWidth: number,
  newHeight: number,
  anchor: readonly [number, number],
): { left: number; top: number } {
  const t = box.rotation * DEG;
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const [ox, oy] = rotate((anchor[0] * box.width) / 2, (anchor[1] * box.height) / 2, t);
  const px = cx + ox;
  const py = cy + oy;
  const [nx, ny] = rotate((anchor[0] * newWidth) / 2, (anchor[1] * newHeight) / 2, t);
  const ncx = px - nx;
  const ncy = py - ny;
  return { left: ncx - newWidth / 2, top: ncy - newHeight / 2 };
}

/** Wrap an angle into [-180, 180). */
export function normalizeAngle(angle: number): number {
  const a = (((angle + 180) % 360) + 360) % 360 - 180;
  return a === 0 ? 0 : a;
}

/**
 * Rotation snapping: with `step` (e.g. 15 while Shift is held) round to multiples of it;
 * otherwise pull towards multiples of 45 degrees when within `magnet` degrees.
 */
export function snapAngle(angle: number, opts: { step?: number; magnet?: number } = {}): number {
  if (opts.step) return normalizeAngle(Math.round(angle / opts.step) * opts.step);
  const magnet = opts.magnet ?? 0;
  if (magnet > 0) {
    const nearest = Math.round(angle / 45) * 45;
    if (Math.abs(nearest - angle) <= magnet) return normalizeAngle(nearest);
  }
  return normalizeAngle(angle);
}

/** Clamp a rotation into the API's [-180, 180] and round to 0.1 degrees. */
export function cleanRotation(angle: number): number {
  return clampRound(normalizeAngle(angle), RANGES.rotation.min, RANGES.rotation.max, 1, 0);
}

/** CSS resize cursor for a handle pointing at `angle` degrees (0 = right, 90 = down). */
export function resizeCursor(angle: number): string {
  const a = ((Math.round(angle / 45) * 45) % 180 + 180) % 180;
  switch (a) {
    case 0:
      return "ew-resize";
    case 45:
      return "nwse-resize";
    case 90:
      return "ns-resize";
    default:
      return "nesw-resize";
  }
}

/**
 * Re-fit a layout made for a card of aspect `fromAr` (height / width) to `toAr`.
 * The composition is scaled uniformly about the card's centre by min(1, toAr / fromAr)
 * so it keeps its proportions (text wraps identically) and fits the new shape.
 */
export function fitLayersToAspect(layers: readonly Layer[], fromAr: number, toAr: number): Layer[] {
  if (Math.abs(fromAr - toAr) < 1e-9) return layers.slice();
  const s = Math.min(1, toAr / fromAr);
  return layers.map((layer) => {
    // Card width is 1 unit; height is the aspect ratio.
    const px = layer.x / 100;
    const py = (layer.y / 100) * fromAr;
    const nx = 0.5 + (px - 0.5) * s;
    const ny = toAr / 2 + (py - fromAr / 2) * s;
    const placed = {
      x: clampRound(nx * 100, RANGES.position.min, RANGES.position.max),
      y: clampRound((ny / toAr) * 100, RANGES.position.min, RANGES.position.max),
      width: clampRound(layer.width * s, MIN_WIDTH, RANGES.width.max),
    };
    if (layer.type === "text") {
      const text: TextLayer = {
        ...layer,
        ...placed,
        font_size: clampRound(layer.font_size * s, RANGES.fontSize.min, RANGES.fontSize.max, 1),
      };
      return text;
    }
    const image: ImageLayer = { ...layer, ...placed };
    return image;
  });
}

/** Height (as % of card height) of a box `heightPx` tall on a card `cardHeightPx` tall. */
export function pct(valuePx: number, totalPx: number): number {
  return totalPx > 0 ? (valuePx / totalPx) * 100 : 0;
}

