// Left-hand panel: add elements, the layer list and starter templates.
import { memo, useMemo, useState, type DragEvent } from "react";
import { CardSurface } from "./CardSurface";
import { cx, IconButton, Section } from "./controls";
import { fontStack } from "./fonts";
import { IconBackward, IconCopy, IconForward, IconGrip, IconImage, IconTrash } from "./icons";
import { layerLabel, MAX_LAYERS } from "./model";
import { templatePreview, TEMPLATES, type CardTemplate } from "./templates";
import type { FontOption, InvitationDesign, Layer, MediaAsset } from "./types";

export interface LeftPanelProps {
  design: InvitationDesign;
  selectedId: string | null;
  fonts: FontOption[];
  assets: MediaAsset[];
  assetUrl: (assetId: string) => string;
  sampleValues: Record<string, string>;
  atLimit: boolean;
  onAddText: (kind: "heading" | "text") => void;
  onAddImage: () => void;
  onSelect: (id: string) => void;
  onShift: (id: string, delta: number) => void;
  onMoveTo: (id: string, index: number) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onTemplate: (template: CardTemplate) => void;
}

export function LeftPanel(props: LeftPanelProps) {
  const { design, fonts, atLimit, onAddText, onAddImage } = props;
  const headingFont = fontStack("Playfair Display", fonts);
  const textFont = fontStack("Cormorant Garamond", fonts);
  return (
    <>
      <Section title="Add to card">
        <div className="dz-add-list">
          <button type="button" className="dz-add-btn" onClick={() => onAddText("heading")} disabled={atLimit}>
            <span className="dz-add-icon dz-add-icon-heading" style={{ fontFamily: headingFont }} aria-hidden="true">
              Aa
            </span>
            <span>Add heading</span>
          </button>
          <button type="button" className="dz-add-btn" onClick={() => onAddText("text")} disabled={atLimit}>
            <span className="dz-add-icon" style={{ fontFamily: textFont }} aria-hidden="true">
              Aa
            </span>
            <span>Add text</span>
          </button>
          <button type="button" className="dz-add-btn" onClick={onAddImage} disabled={atLimit}>
            <span className="dz-add-icon" aria-hidden="true">
              <IconImage size={18} />
            </span>
            <span>Add image</span>
          </button>
        </div>
        {atLimit && <p className="dz-hint">A card can hold up to {MAX_LAYERS} layers.</p>}
      </Section>

      <Section title="Layers" aside={<span className="dz-count">{design.layers.length}</span>}>
        <LayerList {...props} />
      </Section>

      <Section title="Templates">
        <TemplateGallery
          fonts={fonts}
          aspectRatio={design.aspect_ratio}
          sampleValues={props.sampleValues}
          assetUrl={props.assetUrl}
          onPick={props.onTemplate}
        />
      </Section>
    </>
  );
}

function LayerThumb({ layer, fonts, assetUrl }: { layer: Layer; fonts: FontOption[]; assetUrl: (id: string) => string }) {
  if (layer.type === "image") {
    return (
      <span className="dz-layer-thumb">
        <img src={assetUrl(layer.asset_id)} alt="" draggable={false} />
      </span>
    );
  }
  return (
    <span
      className="dz-layer-thumb dz-layer-thumb-text"
      style={{ fontFamily: fontStack(layer.font_family, fonts), color: layer.color }}
    >
      Aa
    </span>
  );
}

function LayerList({
  design,
  selectedId,
  fonts,
  assets,
  assetUrl,
  atLimit,
  onSelect,
  onShift,
  onMoveTo,
  onDuplicate,
  onDelete,
}: LeftPanelProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ index: number; after: boolean } | null>(null);
  const n = design.layers.length;
  // Front-most first, like most design tools.
  const rows = design.layers.map((layer, index) => ({ layer, index })).reverse();

  if (n === 0) {
    return <p className="dz-empty">No layers yet. Add a heading, some text or an image, or start from a template.</p>;
  }

  const reset = () => {
    setDragId(null);
    setDrop(null);
  };

  const onDragOver = (e: DragEvent<HTMLLIElement>, displayIndex: number) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setDrop((prev) => (prev && prev.index === displayIndex && prev.after === after ? prev : { index: displayIndex, after }));
  };

  const onDrop = (e: DragEvent<HTMLLIElement>) => {
    e.preventDefault();
    if (dragId && drop) {
      const from = rows.findIndex((r) => r.layer.id === dragId);
      const insertAt = drop.index + (drop.after ? 1 : 0); // position in the displayed list
      const finalDisplay = insertAt > from ? insertAt - 1 : insertAt;
      onMoveTo(dragId, n - 1 - finalDisplay);
    }
    reset();
  };

  return (
    <ul className="dz-layer-list" aria-label="Layers, front to back">
      {rows.map(({ layer, index }, displayIndex) => {
        const asset = layer.type === "image" ? assets.find((a) => a.id === layer.asset_id) : undefined;
        const label = layerLabel(layer, asset?.filename);
        const kind = layer.type === "image" ? "Image" : "Text";
        const selected = layer.id === selectedId;
        return (
          <li
            key={layer.id}
            className={cx(
              "dz-layer-row",
              selected && "dz-is-selected",
              dragId === layer.id && "dz-is-dragging",
              drop?.index === displayIndex && (drop.after ? "dz-is-drop-after" : "dz-is-drop-before"),
            )}
            draggable
            onDragStart={(e) => {
              setDragId(layer.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", layer.id);
            }}
            onDragOver={(e) => onDragOver(e, displayIndex)}
            onDrop={onDrop}
            onDragEnd={reset}
            onKeyDown={(e) => {
              const onMain = (e.target as HTMLElement).classList.contains("dz-layer-main");
              if (!onMain || (e.key !== "Delete" && e.key !== "Backspace")) return;
              e.preventDefault();
              const list = e.currentTarget.parentElement;
              onDelete(layer.id);
              // Keep keyboard focus in the list: move it to the row that takes this one's place.
              requestAnimationFrame(() => {
                const mains = list ? Array.from(list.querySelectorAll<HTMLElement>(".dz-layer-main")) : [];
                mains[Math.min(displayIndex, mains.length - 1)]?.focus();
              });
            }}
          >
            <span className="dz-layer-grip" aria-hidden="true" title="Drag to reorder">
              <IconGrip size={14} />
            </span>
            <button
              type="button"
              className="dz-layer-main"
              aria-pressed={selected}
              aria-label={`${kind}: ${label}`}
              aria-keyshortcuts="Delete"
              title={label}
              onClick={() => onSelect(layer.id)}
            >
              <LayerThumb layer={layer} fonts={fonts} assetUrl={assetUrl} />
              <span className="dz-layer-name">{label}</span>
            </button>
            <span className="dz-layer-actions">
              <IconButton label={`Bring forward: ${label}`} onClick={() => onShift(layer.id, 1)} disabled={index === n - 1}>
                <IconForward size={14} />
              </IconButton>
              <IconButton label={`Send backward: ${label}`} onClick={() => onShift(layer.id, -1)} disabled={index === 0}>
                <IconBackward size={14} />
              </IconButton>
              <IconButton label={`Duplicate: ${label}`} onClick={() => onDuplicate(layer.id)} disabled={atLimit}>
                <IconCopy size={14} />
              </IconButton>
              <IconButton label={`Delete: ${label}`} onClick={() => onDelete(layer.id)} variant="danger">
                <IconTrash size={14} />
              </IconButton>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

interface TemplateGalleryProps {
  fonts: FontOption[];
  aspectRatio: number;
  sampleValues: Record<string, string>;
  assetUrl: (assetId: string) => string;
  onPick: (template: CardTemplate) => void;
}

/** Live previews of the starter templates (memoised: they don't change while you drag). */
const TemplateGallery = memo(function TemplateGallery({
  fonts,
  aspectRatio,
  sampleValues,
  assetUrl,
  onPick,
}: TemplateGalleryProps) {
  const previews = useMemo(
    () => TEMPLATES.map((template) => ({ template, design: templatePreview(template, fonts, aspectRatio) })),
    [fonts, aspectRatio],
  );
  return (
    <ul className="dz-template-grid">
      {previews.map(({ template, design }) => (
        <li key={template.id} className="dz-template">
          <div className="dz-template-card">
            <CardSurface design={design} fonts={fonts} assetUrl={assetUrl} values={sampleValues} aria-hidden />
          </div>
          <span className="dz-template-name">{template.name}</span>
          <button
            type="button"
            className="dz-template-btn"
            aria-label={`Use the ${template.name} template. ${template.description}`}
            title={template.description}
            onClick={() => onPick(template)}
          />
        </li>
      ))}
    </ul>
  );
});
