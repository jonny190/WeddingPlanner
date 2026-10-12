// Pure gesture maths for the canvas: given the state captured at pointerdown and
// the pointer's movement, compute the layer's new geometry (move, resize, rotate).
// Pixel values are card pixels; the card is never CSS-scaled, so they equal
// screen pixels.
import {
  cleanRotation,
  normalizeAngle,
  resizeAnchored,
  rotatedBounds,
  snapAngle,
  snapAxis,
  snapBounds,
  toLocal,
} from "./geometry";
import { clampRound, MIN_WIDTH, RANGES, round } from "./model";
import type { Layer } from "./types";

export const DRAG_THRESHOLD_PX = 3;
export const SNAP_PX = 6;
export const DEG = Math.PI / 180;

export type ResizeHandle = "e" | "w" | "ne" | "nw" | "se" | "sw";
export type HandleName = "move" | "rotate" | ResizeHandle;

/** Direction of each resize handle in the layer's local axes. */
export const HANDLE_DIRS: Record<ResizeHandle, readonly [number, number]> = {
  e: [1, 0],
  w: [-1, 0],
  ne: [1, -1],
  nw: [-1, -1],
  se: [1, 1],
  sw: [-1, 1],
};

/** Screen angle each handle points at for an unrotated layer (0 = right, 90 = down). */
export const HANDLE_ANGLES: Record<ResizeHandle, number> = { e: 0, se: 45, sw: 135, w: 180, nw: 225, ne: 315 };

export const TEXT_HANDLES: ResizeHandle[] = ["w", "e"];
export const IMAGE_HANDLES: ResizeHandle[] = ["nw", "ne", "se", "sw", "w", "e"];

export interface Drag {
  kind: "move" | "resize" | "rotate";
  handle: HandleName;
  pointerId: number;
  layerId: string;
  /** The layer when the gesture started; every move is computed from it (no drift). */
  start: Layer;
  startX: number;
  startY: number;
  cardLeft: number;
  cardTop: number;
  W: number;
  H: number;
  /** Rendered (unrotated) height of the layer in px at the start. */
  h0: number;
  active: boolean;
  /** Pressed on the selection box rather than directly on a layer. */
  fromBox: boolean;
  /** History key: the whole gesture is one undo step. */
  key: string;
  startAngle: number;
  xTargets: number[];
  yTargets: number[];
}

export interface Modifiers {
  shift: boolean;
  alt: boolean;
}

export interface Step {
  layer: Layer;
  guidesX: number[];
  guidesY: number[];
  hud: string;
}

const pos = (px: number, total: number) =>
  clampRound((px / total) * 100, RANGES.position.min, RANGES.position.max);

export function moveStep(d: Drag, dx: number, dy: number, mods: Modifiers): Step {
  const s = d.start;
  let mx = dx;
  let my = dy;
  const axes = { x: true, y: true };
  if (mods.shift) {
    // Lock to the dominant axis.
    if (Math.abs(dx) >= Math.abs(dy)) {
      my = 0;
      axes.y = false;
    } else {
      mx = 0;
      axes.x = false;
    }
  }
  let left = (s.x / 100) * d.W + mx;
  let top = (s.y / 100) * d.H + my;
  let guidesX: number[] = [];
  let guidesY: number[] = [];
  if (!mods.alt) {
    const bounds = rotatedBounds({ left, top, width: (s.width / 100) * d.W, height: d.h0, rotation: s.rotation });
    const snap = snapBounds(bounds, d.xTargets, d.yTargets, SNAP_PX, axes);
    left += snap.dx;
    top += snap.dy;
    guidesX = snap.guidesX;
    guidesY = snap.guidesY;
  }
  const x = pos(left, d.W);
  const y = pos(top, d.H);
  return { layer: { ...s, x, y }, guidesX, guidesY, hud: `X ${round(x, 1)}%  ·  Y ${round(y, 1)}%` };
}

export function resizeStep(d: Drag, dx: number, dy: number, mods: Modifiers): Step {
  const s = d.start;
  const handle = d.handle as ResizeHandle;
  const [sx, sy] = HANDLE_DIRS[handle];
  const corner = sy !== 0;
  const w0 = (s.width / 100) * d.W;
  const h0 = d.h0;
  // Pointer delta in the layer's own axes.
  const [lx, ly] = toLocal(dx, dy, s.rotation);
  let w1 =
    corner && h0 > 0
      ? w0 * (1 + (sx * lx * w0 + sy * ly * h0) / (w0 * w0 + h0 * h0)) // project onto the diagonal
      : w0 + sx * lx;
  const minW = Math.max((MIN_WIDTH / 100) * d.W, 8);
  const maxW = (RANGES.width.max / 100) * d.W;
  w1 = Math.min(maxW, Math.max(minW, w1));

  const left0 = (s.x / 100) * d.W;
  const top0 = (s.y / 100) * d.H;
  let guidesX: number[] = [];
  if (!corner && !mods.alt && Math.abs(s.rotation) < 0.01) {
    // Snap the dragged edge.
    const edge = sx > 0 ? left0 + w1 : left0 + w0 - w1;
    const snap = snapAxis([edge], d.xTargets, SNAP_PX);
    if (snap) {
      const snapped = edge + snap.delta;
      const candidate = sx > 0 ? snapped - left0 : left0 + w0 - snapped;
      if (candidate >= minW && candidate <= maxW) {
        w1 = candidate;
        guidesX = snap.matched;
      }
    }
  }
  // Images keep their aspect ratio; text height reflows (assume unchanged for anchoring).
  const h1 = s.type === "image" && w0 > 0 ? h0 * (w1 / w0) : h0;
  // Keep the opposite corner (or the top of the opposite edge) fixed on screen.
  const anchor: [number, number] = corner ? [-sx, -sy] : [-sx, -1];
  const next = resizeAnchored({ left: left0, top: top0, width: w0, height: h0, rotation: s.rotation }, w1, h1, anchor);
  const width = clampRound((w1 / d.W) * 100, MIN_WIDTH, RANGES.width.max);
  return {
    layer: { ...s, x: pos(next.left, d.W), y: pos(next.top, d.H), width },
    guidesX,
    guidesY: [],
    hud: `W ${round(width, 1)}%`,
  };
}

export function rotateStep(d: Drag, clientX: number, clientY: number, mods: Modifiers): Step {
  const s = d.start;
  const cx = d.cardLeft + ((s.x + s.width / 2) / 100) * d.W;
  const cy = d.cardTop + (s.y / 100) * d.H + d.h0 / 2;
  const angle = Math.atan2(clientY - cy, clientX - cx) / DEG;
  const raw = s.rotation + (angle - d.startAngle);
  const snapped = mods.shift
    ? snapAngle(raw, { step: 15 })
    : mods.alt
      ? normalizeAngle(raw)
      : snapAngle(raw, { magnet: 3 });
  const rotation = cleanRotation(snapped);
  return { layer: { ...s, rotation }, guidesX: [], guidesY: [], hud: `${round(rotation, 1)}°` };
}
