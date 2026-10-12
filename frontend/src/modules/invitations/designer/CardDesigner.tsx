// The card designer: left panel (add, layers, templates), canvas, properties panel.
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { AssetPicker } from "./AssetPicker";
import { Canvas, layerElements } from "./Canvas";
import { CardSurface } from "./CardSurface";
import { cx, IconButton, Modal, MOD_KEY, Switch, useElementWidth, useMediaQuery } from "./controls";
import { useWebFonts } from "./fonts";
import { fitLayersToAspect } from "./geometry";
import { useDesignHistory, type CommitOptions } from "./history";
import { IconBackward, IconCopy, IconForward, IconRedo, IconTrash, IconUndo } from "./icons";
import type { CardDesignerProps } from "./index";
import { LeftPanel } from "./LeftPanel";
import {
  addLayer,
  charCount,
  clampRound,
  createImageLayer,
  createTextLayer,
  designSwatches,
  duplicateLayer,
  findLayer,
  fitToFont,
  layerLabel,
  MAX_LAYERS,
  MAX_TEXT,
  moveLayerTo,
  normalizeDesign,
  patchLayer,
  RANGES,
  removeLayer,
  replaceLayer,
  shiftLayer,
  truncateChars,
  type LayerPatch,
} from "./model";
import { PropertiesPanel } from "./PropertiesPanel";
import { buildTemplate, type CardTemplate } from "./templates";
import type { CardBackground, InvitationDesign, Layer } from "./types";

type PickerMode = "add" | "replace" | "background";

/** Interactive canvas editor for the card: background, text and image layers. */
export function CardDesigner(props: CardDesignerProps) {
  return props.readOnly ? <ReadOnlyCard {...props} /> : <Designer {...props} />;
}

function ReadOnlyCard({ design, fonts, sampleValues, assetUrl }: CardDesignerProps) {
  useWebFonts(fonts);
  const [preview, setPreview] = useState(true);
  return (
    <div className="dz-root dz-readonly">
      <div className="dz-toolbar">
        <Switch checked={preview} onChange={setPreview} label="Preview with sample guest" />
      </div>
      <div className="dz-canvas dz-canvas-static">
        <div
          className="dz-readonly-card"
          style={{ maxWidth: `min(560px, calc((100vh - 190px) / ${design.aspect_ratio}))` }}
        >
          <CardSurface
            design={design}
            fonts={fonts}
            assetUrl={assetUrl}
            values={preview ? sampleValues : undefined}
            className="dz-stage-card"
          />
        </div>
      </div>
    </div>
  );
}

/** Wait for an image to report its natural size (height / width), or give up. */
function imageAspect(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(null), 4000);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : null);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

function isTextEntry(el: HTMLElement): boolean {
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    return !["range", "color", "checkbox", "radio", "button", "submit", "reset", "file", "image"].includes(el.type);
  }
  return false;
}

function Designer({
  design,
  onChange,
  fonts,
  placeholders,
  sampleValues,
  assets,
  onUploadImage,
  assetUrl,
}: CardDesignerProps) {
  useWebFonts(fonts);
  const history = useDesignHistory(design, onChange);
  const { commit, current, undo, redo } = history;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingIdState] = useState<string | null>(null);
  const [preview, setPreview] = useState(true);
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<CardTemplate | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const cardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const panelTextRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<{ id: string; start: number; end: number } | null>(null);
  const editingRef = useRef<string | null>(null);
  const editSession = useRef(0);
  const mounted = useRef(true);
  const hintId = useId();

  const [rootRef, rootWidth] = useElementWidth<HTMLDivElement>();
  const narrowViewport = useMediaQuery("(max-width: 899px)");
  const mode =
    narrowViewport || (rootWidth > 0 && rootWidth < 840)
      ? "stacked"
      : rootWidth > 0 && rootWidth < 1100
        ? "compact"
        : "wide";

  const selected = findLayer(design, selectedId) ?? null;
  const activeEditingId = editingId && selected?.id === editingId && selected.type === "text" ? editingId : null;
  const atLimit = design.layers.length >= MAX_LAYERS;
  const swatches = useMemo(() => designSwatches(design), [design]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setEditingId = useCallback((id: string | null) => {
    editingRef.current = id;
    setEditingIdState(id);
  }, []);

  // Forget selection/editing that no longer points at a layer (undo, switching drafts).
  useEffect(() => {
    if (selectedId && !findLayer(design, selectedId)) setSelectedId(null);
    if (editingId && editingId !== activeEditingId) setEditingId(null);
  }, [design, selectedId, editingId, activeEditingId, setEditingId]);

  // ---------------------------------------------------------------------------
  // Committing changes (always normalised so the API accepts the result)

  const commitDesign = useCallback(
    (next: InvitationDesign, opts?: CommitOptions) => {
      if (next === current()) return;
      commit(normalizeDesign(next, fonts), opts);
    },
    [commit, current, fonts],
  );

  const announce = useCallback((message: string) => setAnnouncement(message), []);

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (editingRef.current && editingRef.current !== id) setEditingId(null);
      if (id) {
        const layer = findLayer(current(), id);
        if (layer) announce(`Selected ${layer.type} layer: ${layerLabel(layer)}`);
      }
    },
    [announce, current, setEditingId],
  );

  const patchSelected = (patch: LayerPatch, field: string) => {
    if (!selectedId) return;
    commitDesign(patchLayer(current(), selectedId, patch), { key: `prop:${selectedId}:${field}` });
  };

  const onLayerChange = useCallback(
    (layer: Layer, key: string) => commitDesign(replaceLayer(current(), layer), { key, windowMs: Infinity }),
    [commitDesign, current],
  );

  const setFontFamily = (family: string) => {
    const layer = findLayer(current(), selectedId);
    if (layer?.type !== "text") return;
    commitDesign(replaceLayer(current(), fitToFont({ ...layer, font_family: family }, fonts)));
  };

  const patchBackground = (patch: Partial<CardBackground>, field: string) => {
    const base = current();
    commitDesign({ ...base, background: { ...base.background, ...patch } }, { key: `bg:${field}` });
  };

  const setAspect = (ratio: number) => {
    const base = current();
    if (Math.abs(base.aspect_ratio - ratio) < 1e-9) return;
    commitDesign({
      ...base,
      aspect_ratio: ratio,
      layers: fitLayersToAspect(base.layers, base.aspect_ratio, ratio),
    });
  };

  // ---------------------------------------------------------------------------
  // Layer operations

  const addText = (kind: "heading" | "text") => {
    const base = current();
    if (base.layers.length >= MAX_LAYERS) return;
    const layer = createTextLayer(base, fonts, kind);
    commitDesign(addLayer(base, layer));
    select(layer.id);
  };

  const addImage = async (assetId: string) => {
    const aspect = await imageAspect(assetUrl(assetId));
    if (!mounted.current) return;
    const base = current();
    if (base.layers.length >= MAX_LAYERS) return;
    const layer = createImageLayer(base, assetId, aspect);
    commitDesign(addLayer(base, layer));
    select(layer.id);
  };

  const duplicate = (id: string) => {
    const result = duplicateLayer(current(), id);
    if (!result.id) return;
    commitDesign(result.design);
    select(result.id);
    announce("Layer duplicated");
  };

  const remove = (id: string) => {
    const layer = findLayer(current(), id);
    if (!layer) return;
    commitDesign(removeLayer(current(), id));
    if (selectedId === id) select(null);
    announce(`Deleted ${layer.type} layer. Press ${MOD_KEY}+Z to undo.`);
  };

  const shift = (id: string, delta: number) => commitDesign(shiftLayer(current(), id, delta));
  const moveTo = (id: string, index: number) => commitDesign(moveLayerTo(current(), id, index));

  const nudge = (dx: number, dy: number) => {
    const layer = findLayer(current(), selectedId);
    if (!layer) return;
    const { min, max } = RANGES.position;
    commitDesign(
      patchLayer(current(), layer.id, { x: clampRound(layer.x + dx, min, max), y: clampRound(layer.y + dy, min, max) }),
      { key: `nudge:${layer.id}`, windowMs: 800 },
    );
  };

  const center = (axis: "x" | "y") => {
    const layer = findLayer(current(), selectedId);
    if (!layer) return;
    const { min, max } = RANGES.position;
    if (axis === "x") {
      patchSelected({ x: clampRound(50 - layer.width / 2, min, max) }, "center-x");
      return;
    }
    const card = cardRef.current;
    const el = card && layerElements(card).get(layer.id);
    if (!card || !el || card.clientHeight <= 0) return;
    const heightPct = (el.offsetHeight / card.clientHeight) * 100;
    patchSelected({ y: clampRound(50 - heightPct / 2, min, max) }, "center-y");
  };

  const applyTemplate = (template: CardTemplate) => {
    const base = current();
    const built = buildTemplate(template, fonts, base.aspect_ratio);
    commitDesign({ ...base, background: built.background, layers: built.layers });
    select(null);
    setPendingTemplate(null);
    announce(`Applied the ${template.name} template. Press ${MOD_KEY}+Z to undo.`);
  };

  // ---------------------------------------------------------------------------
  // Text editing

  const startEditing = (id: string) => {
    const layer = findLayer(current(), id);
    if (layer?.type !== "text") return;
    editSession.current += 1;
    setSelectedId(id);
    setEditingId(id);
  };

  const activate = (id: string) => {
    const layer = findLayer(current(), id);
    if (!layer) return;
    if (layer.type === "text") startEditing(id);
    else {
      select(id);
      setPicker("replace");
    }
  };

  const editText = (id: string, text: string) =>
    commitDesign(patchLayer(current(), id, { text: truncateChars(text, MAX_TEXT) }), {
      key: `edit:${id}:${editSession.current}`,
      windowMs: Infinity,
    });

  const endEditing = (refocusCanvas: boolean) => {
    const id = editingRef.current;
    if (!id) return;
    setEditingId(null);
    const layer = findLayer(current(), id);
    if (layer?.type === "text" && !layer.text.trim()) {
      // An emptied text box is removed (part of the same undo step as the edit).
      commitDesign(removeLayer(current(), id), { key: `edit:${id}:${editSession.current}`, windowMs: Infinity });
      setSelectedId(null);
    }
    if (refocusCanvas) canvasRef.current?.focus({ preventScroll: true });
  };

  const onCaret = useCallback((id: string, start: number, end: number) => {
    caretRef.current = { id, start, end };
  }, []);

  const insertPlaceholder = (name: string) => {
    const layer = findLayer(current(), selectedId);
    if (layer?.type !== "text") return;
    const token = `{{${name}}}`;
    const caret = caretRef.current?.id === layer.id ? caretRef.current : null;
    const text = layer.text;
    const start = Math.min(caret?.start ?? text.length, text.length);
    const end = Math.min(Math.max(caret?.end ?? start, start), text.length);
    const nextText = text.slice(0, start) + token + text.slice(end);
    if (charCount(nextText) > MAX_TEXT) {
      announce(`Text can be at most ${MAX_TEXT} characters.`);
      return;
    }
    commitDesign(patchLayer(current(), layer.id, { text: nextText }));
    const position = start + token.length;
    caretRef.current = { id: layer.id, start: position, end: position };
    const target = editingRef.current === layer.id ? editorRef.current : panelTextRef.current;
    requestAnimationFrame(() => {
      if (!target || !target.isConnected) return;
      target.focus();
      target.setSelectionRange(position, position);
    });
  };

  // ---------------------------------------------------------------------------
  // Image picker

  const onPick = (assetId: string) => {
    const pickerMode = picker;
    setPicker(null);
    if (pickerMode === "add") {
      void addImage(assetId);
    } else if (pickerMode === "replace") {
      const layer = findLayer(current(), selectedId);
      if (layer?.type === "image") commitDesign(patchLayer(current(), layer.id, { asset_id: assetId }));
    } else if (pickerMode === "background") {
      patchBackground({ image_asset_id: assetId }, "image");
    }
  };

  const pickerProps =
    picker === "add"
      ? { title: "Add an image", description: "Choose an image from your library or upload a new one.", selectedId: null }
      : picker === "replace"
        ? {
            title: "Replace image",
            description: "The new image keeps this layer's position, width and rotation.",
            selectedId: selected?.type === "image" ? selected.asset_id : null,
          }
        : {
            title: "Background image",
            description: "Fills the card behind everything else. You can fade it with the opacity slider.",
            selectedId: design.background.image_asset_id,
          };

  // ---------------------------------------------------------------------------
  // Keyboard

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && !e.altKey && (key === "z" || key === "y")) {
      if (isTextEntry(target)) return; // native undo inside text fields
      e.preventDefault();
      if (key === "y" || e.shiftKey) redo();
      else undo();
      return;
    }
    if (target !== canvasRef.current) return;
    const layer = selected;
    if (e.key === "Escape") {
      if (layer) {
        e.preventDefault();
        select(null);
      }
      return;
    }
    if (!layer) return;
    if (mod && key === "d") {
      e.preventDefault();
      duplicate(layer.id);
      return;
    }
    if (mod && (e.key === "]" || e.key === "[")) {
      e.preventDefault();
      shift(layer.id, e.key === "]" ? 1 : -1);
      return;
    }
    if (mod) return;
    const step = e.shiftKey ? 5 : 0.5;
    switch (e.key) {
      case "Delete":
      case "Backspace":
        e.preventDefault();
        remove(layer.id);
        break;
      case "ArrowLeft":
        e.preventDefault();
        nudge(-step, 0);
        break;
      case "ArrowRight":
        e.preventDefault();
        nudge(step, 0);
        break;
      case "ArrowUp":
        e.preventDefault();
        nudge(0, -step);
        break;
      case "ArrowDown":
        e.preventDefault();
        nudge(0, step);
        break;
      case "Enter":
        e.preventDefault();
        activate(layer.id);
        break;
    }
  };

  // ---------------------------------------------------------------------------

  return (
    <div ref={rootRef} className={cx("dz-root", `dz-mode-${mode}`)} onKeyDown={onKeyDown}>
      <div className="dz-designer">
        <aside className="dz-panel dz-left" aria-label="Add elements, layers and templates">
          <LeftPanel
            design={design}
            selectedId={selected?.id ?? null}
            fonts={fonts}
            assets={assets}
            assetUrl={assetUrl}
            sampleValues={sampleValues}
            atLimit={atLimit}
            onAddText={addText}
            onAddImage={() => setPicker("add")}
            onSelect={select}
            onShift={shift}
            onMoveTo={moveTo}
            onDuplicate={duplicate}
            onDelete={remove}
            onTemplate={setPendingTemplate}
          />
        </aside>

        <div className="dz-center">
          <div className="dz-toolbar">
            <div className="dz-toolbar-group">
              <IconButton label="Undo" shortcut={`${MOD_KEY}+Z`} onClick={undo} disabled={!history.canUndo}>
                <IconUndo />
              </IconButton>
              <IconButton label="Redo" shortcut={`${MOD_KEY}+Shift+Z`} onClick={redo} disabled={!history.canRedo}>
                <IconRedo />
              </IconButton>
            </div>
            <Switch checked={preview} onChange={setPreview} label="Preview with sample guest" />
            <div className="dz-toolbar-group dz-toolbar-end">
              {selected && (
                <>
                  <IconButton
                    label="Bring forward"
                    shortcut={`${MOD_KEY}+]`}
                    onClick={() => shift(selected.id, 1)}
                    disabled={design.layers[design.layers.length - 1]?.id === selected.id}
                  >
                    <IconForward />
                  </IconButton>
                  <IconButton
                    label="Send backward"
                    shortcut={`${MOD_KEY}+[`}
                    onClick={() => shift(selected.id, -1)}
                    disabled={design.layers[0]?.id === selected.id}
                  >
                    <IconBackward />
                  </IconButton>
                  <IconButton
                    label="Duplicate"
                    shortcut={`${MOD_KEY}+D`}
                    onClick={() => duplicate(selected.id)}
                    disabled={atLimit}
                  >
                    <IconCopy />
                  </IconButton>
                  <IconButton label="Delete" shortcut="Delete" onClick={() => remove(selected.id)} variant="danger">
                    <IconTrash />
                  </IconButton>
                </>
              )}
            </div>
          </div>

          <Canvas
            design={design}
            fonts={fonts}
            assetUrl={assetUrl}
            values={preview ? sampleValues : undefined}
            selectedId={selected?.id ?? null}
            editingId={activeEditingId}
            cardRef={cardRef}
            canvasRef={canvasRef}
            editorRef={editorRef}
            describedBy={hintId}
            onSelect={select}
            onActivate={activate}
            onLayerChange={onLayerChange}
            onEditText={editText}
            onEditEnd={endEditing}
            onCaret={onCaret}
          />
          <p className="dz-canvas-hint" id={hintId}>
            Drag to move · double-click text to edit · Shift locks the direction · hold Alt to turn off snapping ·
            arrow keys nudge (Shift for bigger steps)
          </p>
        </div>

        <aside className="dz-panel dz-right" aria-label={selected ? "Layer properties" : "Card properties"}>
          <PropertiesPanel
            design={design}
            layer={selected}
            fonts={fonts}
            placeholders={placeholders}
            assets={assets}
            assetUrl={assetUrl}
            swatches={swatches}
            textRef={panelTextRef}
            atLimit={atLimit}
            onPatch={patchSelected}
            onFontFamily={setFontFamily}
            onInsertPlaceholder={insertPlaceholder}
            onCaret={onCaret}
            onCenter={center}
            onReplaceImage={() => setPicker("replace")}
            onDuplicate={() => selected && duplicate(selected.id)}
            onDelete={() => selected && remove(selected.id)}
            onDeselect={() => select(null)}
            onBackground={patchBackground}
            onBackgroundImage={() => setPicker("background")}
            onAspect={setAspect}
          />
        </aside>
      </div>

      {picker && (
        <AssetPicker
          {...pickerProps}
          assets={assets}
          assetUrl={assetUrl}
          onUploadImage={onUploadImage}
          onPick={onPick}
          onClose={() => setPicker(null)}
        />
      )}

      {pendingTemplate && (
        <Modal
          title={`Use the ${pendingTemplate.name} template?`}
          size="sm"
          onClose={() => setPendingTemplate(null)}
          footer={
            <>
              <button type="button" className="dz-btn" onClick={() => setPendingTemplate(null)}>
                Cancel
              </button>
              <button type="button" className="dz-btn dz-btn-primary" onClick={() => applyTemplate(pendingTemplate)}>
                Replace my card
              </button>
            </>
          }
        >
          <p>
            This replaces the text, images and background on your card with the {pendingTemplate.name} design. Your
            card shape and email style stay as they are, and you can undo it.
          </p>
        </Modal>
      )}

      <div className="dz-visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
