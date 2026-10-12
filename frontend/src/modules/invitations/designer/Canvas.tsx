// The designer's canvas: the card (rendered by the shared CardSurface) plus an
// overlay for selection, handles, snapping guides and in-place text editing.
//
// Coordinates: pointer deltas are screen pixels. The card is never CSS-scaled
// (it is laid out at its real pixel width), so a screen pixel is a card pixel.
// x/width are converted with the card's rendered width, y with its height.
import {
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { CardSurface, layerBoxStyle, textStyle } from "./CardSurface";
import { cx, useElementWidth, useViewportHeight } from "./controls";
import { cardTargets, resizeCursor, rotatedBounds } from "./geometry";
import {
  DEG,
  DRAG_THRESHOLD_PX,
  HANDLE_ANGLES,
  IMAGE_HANDLES,
  moveStep,
  resizeStep,
  rotateStep,
  TEXT_HANDLES,
  type Drag,
  type HandleName,
} from "./gestures";
import { MAX_TEXT } from "./model";
import type { FontOption, InvitationDesign, Layer, TextLayer } from "./types";

const MAX_CARD_WIDTH = 560;

let gestureCounter = 0;

/** Layer elements of a card by id. */
export function layerElements(card: HTMLElement): Map<string, HTMLElement> {
  const map = new Map<string, HTMLElement>();
  for (const child of Array.from(card.children)) {
    const el = child as HTMLElement;
    const id = el.dataset?.layerId;
    if (id) map.set(id, el);
  }
  return map;
}

/** The top-most layer under a screen point. */
function topLayerAt(card: HTMLElement, clientX: number, clientY: number): string | null {
  if (typeof document.elementsFromPoint !== "function") return null;
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (!card.contains(el)) continue;
    const layerEl = (el as HTMLElement).closest<HTMLElement>("[data-layer-id]");
    if (layerEl && card.contains(layerEl)) return layerEl.dataset.layerId ?? null;
  }
  return null;
}

/** Snap lines: the card's edges and centre, plus every other layer's edges and centre. */
function collectTargets(card: HTMLElement, layers: readonly Layer[], exclude: string, W: number, H: number) {
  const { xs, ys } = cardTargets(W, H);
  const els = layerElements(card);
  for (const layer of layers) {
    if (layer.id === exclude) continue;
    const b = rotatedBounds({
      left: (layer.x / 100) * W,
      top: (layer.y / 100) * H,
      width: (layer.width / 100) * W,
      height: els.get(layer.id)?.offsetHeight ?? 0,
      rotation: layer.rotation,
    });
    xs.push(b.x0, b.xc, b.x1);
    ys.push(b.y0, b.yc, b.y1);
  }
  return { xs, ys };
}

export interface CanvasProps {
  design: InvitationDesign;
  fonts: readonly FontOption[];
  assetUrl: (assetId: string) => string;
  values?: Record<string, string>;
  selectedId: string | null;
  editingId: string | null;
  cardRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  describedBy?: string;
  onSelect: (id: string | null) => void;
  /** Double-click / Enter on a layer: edit text, replace an image. */
  onActivate: (id: string) => void;
  /** A gesture changed a layer; commits with the gesture's history key. */
  onLayerChange: (layer: Layer, key: string) => void;
  onEditText: (id: string, text: string) => void;
  onEditEnd: (refocusCanvas: boolean) => void;
  onCaret: (id: string, start: number, end: number) => void;
}

export function Canvas({
  design,
  fonts,
  assetUrl,
  values,
  selectedId,
  editingId,
  cardRef,
  canvasRef,
  editorRef,
  describedBy,
  onSelect,
  onActivate,
  onLayerChange,
  onEditText,
  onEditEnd,
  onCaret,
}: CanvasProps) {
  const [measureRef, available] = useElementWidth<HTMLDivElement>();
  const viewportHeight = useViewportHeight();
  const dragRef = useRef<Drag | null>(null);
  const [dragKind, setDragKind] = useState<Drag["kind"] | null>(null);
  const [guides, setGuides] = useState<{ xs: number[]; ys: number[] } | null>(null);
  const [hud, setHud] = useState<{ x: number; y: number; text: string } | null>(null);
  const [selectedHeight, setSelectedHeight] = useState(0);

  const ratio = design.aspect_ratio;
  // Fit the card to the column, at most 560px wide, and short enough to stay on screen.
  const maxHeight = Math.max(320, viewportHeight - 190);
  const width = Math.floor(Math.max(160, Math.min(available, MAX_CARD_WIDTH, maxHeight / ratio)));

  const selected = selectedId ? design.layers.find((l) => l.id === selectedId) : undefined;
  const editing: TextLayer | undefined =
    selected && selected.type === "text" && selected.id === editingId ? selected : undefined;

  // Track the selected layer's rendered height (text reflows, fonts and images load).
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || !selectedId) return;
    const el = layerElements(card).get(selectedId);
    if (!el) return;
    const update = () => setSelectedHeight(el.offsetHeight);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cardRef, selectedId, design, values, width]);

  const endGesture = () => {
    dragRef.current = null;
    setDragKind(null);
    setGuides(null);
    setHud(null);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || dragRef.current) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-dz-editor]")) return; // let the textarea handle it
    const card = cardRef.current;
    if (!card) return;
    e.currentTarget.focus({ preventScroll: true });

    const handleEl = target.closest<HTMLElement>("[data-dz-handle]");
    let layer: Layer | undefined;
    let handle: HandleName = "move";
    if (handleEl && selected) {
      layer = selected;
      handle = (handleEl.dataset.dzHandle as HandleName | undefined) ?? "move";
    } else {
      const layerEl = target.closest<HTMLElement>("[data-layer-id]");
      const id = layerEl && card.contains(layerEl) ? layerEl.dataset.layerId : undefined;
      layer = id ? design.layers.find((l) => l.id === id) : undefined;
    }
    if (!layer) {
      onSelect(null);
      return;
    }
    if (layer.id !== selectedId) onSelect(layer.id);

    const rect = card.getBoundingClientRect();
    const h0 = layerElements(card).get(layer.id)?.offsetHeight ?? 0;
    const cx = rect.left + ((layer.x + layer.width / 2) / 100) * rect.width;
    const cy = rect.top + (layer.y / 100) * rect.height + h0 / 2;
    gestureCounter += 1;
    dragRef.current = {
      kind: handle === "move" ? "move" : handle === "rotate" ? "rotate" : "resize",
      handle,
      pointerId: e.pointerId,
      layerId: layer.id,
      start: layer,
      startX: e.clientX,
      startY: e.clientY,
      cardLeft: rect.left,
      cardTop: rect.top,
      W: rect.width,
      H: rect.height,
      h0,
      active: false,
      fromBox: !!handleEl && handle === "move",
      key: `gesture:${gestureCounter}`,
      startAngle: Math.atan2(e.clientY - cy, e.clientX - cx) / DEG,
      xTargets: [],
      yTargets: [],
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already released; the gesture simply ends on pointerup.
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId || d.W <= 0 || d.H <= 0) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      d.active = true;
      const card = cardRef.current;
      if (card) {
        const targets = collectTargets(card, design.layers, d.layerId, d.W, d.H);
        d.xTargets = targets.xs;
        d.yTargets = targets.ys;
      }
      setDragKind(d.kind);
    }
    const mods = { shift: e.shiftKey, alt: e.altKey };
    const step =
      d.kind === "move"
        ? moveStep(d, dx, dy, mods)
        : d.kind === "resize"
          ? resizeStep(d, dx, dy, mods)
          : rotateStep(d, e.clientX, e.clientY, mods);
    onLayerChange(step.layer, d.key);
    setGuides(step.guidesX.length || step.guidesY.length ? { xs: step.guidesX, ys: step.guidesY } : null);
    setHud({ x: e.clientX - d.cardLeft, y: e.clientY - d.cardTop, text: step.hud });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    endGesture();
    if (!d.active && d.fromBox && cardRef.current) {
      // A click (not a drag) on the selection box selects whatever is on top there.
      const hit = topLayerAt(cardRef.current, e.clientX, e.clientY);
      if (hit && hit !== d.layerId) onSelect(hit);
    }
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (d && e.pointerId === d.pointerId) endGesture();
  };

  const onDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-dz-editor]")) return;
    if (selected) onActivate(selected.id);
  };

  return (
    <div
      ref={canvasRef}
      className={cx("dz-canvas dz-canvas-edit", dragKind && `dz-is-${dragKind === "move" ? "moving" : dragKind === "resize" ? "resizing" : "rotating"}`)}
      tabIndex={0}
      role="group"
      aria-label="Card canvas"
      aria-describedby={describedBy}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onDoubleClick={onDoubleClick}
    >
      <div className="dz-canvas-inner" ref={measureRef}>
        {available > 0 && (
          <div className="dz-stage" style={{ width }}>
            <CardSurface
              design={design}
              fonts={fonts}
              assetUrl={assetUrl}
              values={values}
              hiddenLayerId={editing?.id}
              cardRef={cardRef}
              className="dz-stage-card"
            />
            <div className="dz-overlay">
              {design.layers.length === 0 && (
                <p className="dz-empty-hint">Add a heading, text or an image from the left, or start from a template.</p>
              )}
              {guides?.xs.map((x) => (
                <div key={`x${x.toFixed(1)}`} className="dz-guide dz-guide-v" style={{ left: x }} />
              ))}
              {guides?.ys.map((y) => (
                <div key={`y${y.toFixed(1)}`} className="dz-guide dz-guide-h" style={{ top: y }} />
              ))}
              {selected && !editing && <SelectionBox layer={selected} height={selectedHeight} />}
              {editing && (
                <InlineEditor
                  key={editing.id}
                  layer={editing}
                  fonts={fonts}
                  editorRef={editorRef}
                  onChange={(text) => onEditText(editing.id, text)}
                  onDone={onEditEnd}
                  onCaret={(start, end) => onCaret(editing.id, start, end)}
                />
              )}
              {hud && (
                <div className="dz-hud" style={{ left: hud.x + 14, top: hud.y + 18 }} aria-hidden="true">
                  {hud.text}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SelectionBox({ layer, height }: { layer: Layer; height: number }) {
  const handles = layer.type === "image" ? IMAGE_HANDLES : TEXT_HANDLES;
  return (
    <div
      className={cx("dz-selection", layer.type === "image" ? "dz-is-image" : "dz-is-text")}
      data-dz-handle="move"
      style={{ ...layerBoxStyle(layer, 1), height: Math.max(height, 6) }}
    >
      {handles.map((h) => (
        <div
          key={h}
          className={`dz-handle dz-handle-${h}`}
          data-dz-handle={h}
          aria-hidden="true"
          style={{ cursor: resizeCursor(HANDLE_ANGLES[h] + layer.rotation) }}
        />
      ))}
      <div className="dz-rotate-stem" aria-hidden="true" />
      <div className="dz-handle dz-handle-rotate" data-dz-handle="rotate" aria-hidden="true" title="Drag to rotate (Shift: 15° steps)" />
    </div>
  );
}

const PLACEHOLDER_TEXTS = new Set(["Your heading", "Add a little text here"]);

function InlineEditor({
  layer,
  fonts,
  editorRef,
  onChange,
  onDone,
  onCaret,
}: {
  layer: TextLayer;
  fonts: readonly FontOption[];
  editorRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (text: string) => void;
  onDone: (refocusCanvas: boolean) => void;
  onCaret: (start: number, end: number) => void;
}) {
  // Grow with the content so the box always matches the text.
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  });

  // Focus on open: select starter text so typing replaces it, otherwise caret at the end.
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (PLACEHOLDER_TEXTS.has(el.value)) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
    onCaret(el.selectionStart, el.selectionEnd);
    // Only when the editor opens.
  }, []);

  return (
    <div className="dz-editor-box" data-dz-editor="" style={layerBoxStyle(layer, 1)}>
      <textarea
        ref={editorRef}
        className="dz-editor"
        value={layer.text}
        rows={1}
        maxLength={MAX_TEXT}
        aria-label="Edit text. Press Escape when done."
        style={textStyle(layer, fonts)}
        onChange={(e) => {
          onChange(e.target.value);
          onCaret(e.target.selectionStart, e.target.selectionEnd);
        }}
        onSelect={(e) => onCaret(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)}
        onBlur={() => onDone(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            e.stopPropagation();
            onDone(true);
          }
        }}
      />
    </div>
  );
}
