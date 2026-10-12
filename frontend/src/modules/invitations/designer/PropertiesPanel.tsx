// Right-hand panel: properties of the selected layer, or of the card itself.
import { useId, useRef, type ReactNode, type RefObject } from "react";
import {
  ColorField,
  Field,
  IconButton,
  MenuButton,
  MOD_KEY,
  NumberInput,
  Section,
  Segmented,
  SliderField,
  Switch,
} from "./controls";
import { FontPicker } from "./FontPicker";
import { findFont, weightName } from "./fonts";
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconBraces,
  IconCenterH,
  IconCenterV,
  IconClose,
  IconCopy,
  IconImage,
  IconItalic,
  IconRotate,
  IconTrash,
  IconUppercase,
} from "./icons";
import {
  charCount,
  MAX_TEXT,
  RANGES,
  round,
  SHAPE_PRESETS,
  shapePresetFor,
  truncateChars,
  type LayerPatch,
} from "./model";
import type {
  CardBackground,
  FontOption,
  ImageLayer,
  InvitationDesign,
  Layer,
  MediaAsset,
  Placeholder,
  TextLayer,
} from "./types";

export interface PropertiesPanelProps {
  design: InvitationDesign;
  layer: Layer | null;
  fonts: FontOption[];
  placeholders: Placeholder[];
  assets: MediaAsset[];
  assetUrl: (assetId: string) => string;
  swatches: string[];
  textRef: RefObject<HTMLTextAreaElement | null>;
  atLimit: boolean;
  onPatch: (patch: LayerPatch, field: string) => void;
  onFontFamily: (family: string) => void;
  onInsertPlaceholder: (name: string) => void;
  onCaret: (id: string, start: number, end: number) => void;
  onCenter: (axis: "x" | "y") => void;
  onReplaceImage: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDeselect: () => void;
  onBackground: (patch: Partial<CardBackground>, field: string) => void;
  onBackgroundImage: () => void;
  onAspect: (ratio: number) => void;
}

export function PropertiesPanel(props: PropertiesPanelProps) {
  const { layer } = props;
  if (layer?.type === "text") return <TextProperties {...props} layer={layer} />;
  if (layer?.type === "image") return <ImageProperties {...props} layer={layer} />;
  return <CardProperties {...props} />;
}

function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="dz-panel-head">
      <h2 className="dz-panel-title">{title}</h2>
      {children && <div className="dz-panel-head-actions">{children}</div>}
    </div>
  );
}

function LayerHeader({ title, atLimit, onDuplicate, onDelete, onDeselect }: PropertiesPanelProps & { title: string }) {
  return (
    <PanelHeader title={title}>
      <IconButton label="Duplicate" shortcut={`${MOD_KEY}+D`} onClick={onDuplicate} disabled={atLimit}>
        <IconCopy />
      </IconButton>
      <IconButton label="Delete" shortcut="Delete" onClick={onDelete} variant="danger">
        <IconTrash />
      </IconButton>
      <IconButton label="Done (deselect)" shortcut="Esc" onClick={onDeselect}>
        <IconClose />
      </IconButton>
    </PanelHeader>
  );
}

// ---------------------------------------------------------------------------

function TextProperties(props: PropertiesPanelProps & { layer: TextLayer }) {
  const { layer, fonts, placeholders, swatches, textRef, onPatch, onFontFamily, onInsertPlaceholder, onCaret } = props;
  const textId = useId();
  const fontId = useId();
  const weightId = useId();
  const font = findFont(fonts, layer.font_family);
  const weights = font ? font.weights : [layer.font_weight];
  const weightOptions = weights.includes(layer.font_weight)
    ? weights
    : [...weights, layer.font_weight].sort((a, b) => a - b);
  const italicSupported = font ? font.italic : true;
  const count = charCount(layer.text);
  const reportCaret = (el: HTMLTextAreaElement) => onCaret(layer.id, el.selectionStart, el.selectionEnd);
  // The card is shown on the RSVP page itself, so the reply link makes no sense on it.
  const menuItems = placeholders
    .filter((p) => p.name !== "rsvp_link")
    .map((p) => ({ id: p.name, label: `{{${p.name}}}`, description: p.description }));

  return (
    <>
      <LayerHeader {...props} title="Text" />

      <Section
        title="Content"
        aside={
          <MenuButton
            label="Insert placeholder"
            icon={<IconBraces size={14} />}
            items={menuItems}
            onSelect={onInsertPlaceholder}
            align="end"
            emptyText="No placeholders available"
          />
        }
      >
        <label htmlFor={textId} className="dz-visually-hidden">
          Text
        </label>
        <textarea
          id={textId}
          ref={textRef}
          className="dz-input dz-textarea"
          value={layer.text}
          rows={3}
          maxLength={MAX_TEXT}
          onChange={(e) => {
            onPatch({ text: truncateChars(e.target.value, MAX_TEXT) }, "text");
            reportCaret(e.target);
          }}
          onSelect={(e) => reportCaret(e.currentTarget)}
          onKeyUp={(e) => reportCaret(e.currentTarget)}
          onClick={(e) => reportCaret(e.currentTarget)}
        />
        <div className="dz-foot-row">
          <span className="dz-hint">Placeholders are filled in for each guest. Double-click text on the card to edit it there.</span>
          <span className={count > MAX_TEXT * 0.95 ? "dz-count dz-is-warn" : "dz-count"}>
            {count}/{MAX_TEXT}
          </span>
        </div>
      </Section>

      <Section title="Typography">
        <Field label="Font" htmlFor={fontId}>
          <FontPicker id={fontId} label="Font" value={layer.font_family} fonts={fonts} onChange={onFontFamily} />
        </Field>
        <div className="dz-row">
          <div className="dz-grow">
            <label className="dz-visually-hidden" htmlFor={weightId}>
              Weight
            </label>
            <select
              id={weightId}
              className="dz-input dz-select"
              value={layer.font_weight}
              disabled={weightOptions.length < 2}
              title={weightOptions.length < 2 ? `${layer.font_family} comes in one weight` : "Weight"}
              onChange={(e) => onPatch({ font_weight: Number(e.target.value) }, "weight")}
            >
              {weightOptions.map((w) => (
                <option key={w} value={w}>
                  {weightName(w)} ({w})
                </option>
              ))}
            </select>
          </div>
          <IconButton
            label={italicSupported ? "Italic" : `Italic (not available in ${layer.font_family})`}
            pressed={layer.italic}
            disabled={!italicSupported && !layer.italic}
            onClick={() => onPatch({ italic: !layer.italic }, "italic")}
          >
            <IconItalic />
          </IconButton>
          <IconButton
            label="Uppercase"
            pressed={layer.uppercase}
            onClick={() => onPatch({ uppercase: !layer.uppercase }, "uppercase")}
          >
            <IconUppercase />
          </IconButton>
        </div>
        <SliderField
          label="Size"
          value={layer.font_size}
          min={RANGES.fontSize.min}
          max={120}
          inputMax={RANGES.fontSize.max}
          step={1}
          decimals={1}
          suffix="px"
          onChange={(v) => onPatch({ font_size: v }, "size")}
        />
        <ColorField
          label="Colour"
          value={layer.color}
          swatches={swatches}
          onChange={(color) => onPatch({ color }, "color")}
        />
        <Field label="Alignment">
          <Segmented
            label="Alignment"
            iconOnly
            value={layer.align}
            onChange={(align) => onPatch({ align }, "align")}
            options={[
              { value: "left", label: "Align left", icon: <IconAlignLeft /> },
              { value: "center", label: "Align centre", icon: <IconAlignCenter /> },
              { value: "right", label: "Align right", icon: <IconAlignRight /> },
            ]}
          />
        </Field>
        <SliderField
          label="Line height"
          value={layer.line_height}
          min={RANGES.lineHeight.min}
          max={RANGES.lineHeight.max}
          step={0.05}
          decimals={2}
          onChange={(v) => onPatch({ line_height: v }, "line_height")}
        />
        <SliderField
          label="Letter spacing"
          value={layer.letter_spacing}
          min={RANGES.letterSpacing.min}
          max={RANGES.letterSpacing.max}
          step={0.01}
          decimals={3}
          suffix="em"
          onChange={(v) => onPatch({ letter_spacing: v }, "letter_spacing")}
        />
      </Section>

      <ArrangeSection {...props} showWidth />
    </>
  );
}

// ---------------------------------------------------------------------------

function ImageProperties(props: PropertiesPanelProps & { layer: ImageLayer }) {
  const { layer, assets, assetUrl, onPatch, onReplaceImage } = props;
  const asset = assets.find((a) => a.id === layer.asset_id);
  return (
    <>
      <LayerHeader {...props} title="Image" />
      <Section title="Image">
        <div className="dz-image-preview">
          <img src={assetUrl(layer.asset_id)} alt="" draggable={false} />
        </div>
        {asset && <p className="dz-hint dz-truncate">{asset.filename}</p>}
        <button type="button" className="dz-btn dz-btn-block" onClick={onReplaceImage}>
          <IconImage />
          <span>Replace image</span>
        </button>
        <SliderField
          label="Width"
          value={layer.width}
          min={RANGES.width.min}
          max={RANGES.width.max}
          step={0.5}
          decimals={2}
          suffix="%"
          onChange={(v) => onPatch({ width: v }, "width")}
        />
        <SliderField
          label="Corner radius"
          value={layer.border_radius}
          min={RANGES.borderRadius.min}
          max={RANGES.borderRadius.max}
          step={1}
          decimals={1}
          suffix="%"
          onChange={(v) => onPatch({ border_radius: v }, "border_radius")}
        />
      </Section>
      <ArrangeSection {...props} showWidth={false} />
    </>
  );
}

// ---------------------------------------------------------------------------

function ArrangeSection({
  layer,
  showWidth,
  onPatch,
  onCenter,
}: PropertiesPanelProps & { showWidth: boolean }) {
  const xId = useId();
  const yId = useId();
  const wId = useId();
  if (!layer) return null;
  return (
    <Section title="Arrange">
      <div className={showWidth ? "dz-xyw" : "dz-xyw dz-xy"}>
        <Field label="X" htmlFor={xId}>
          <NumberInput
            id={xId}
            value={layer.x}
            min={RANGES.position.min}
            max={RANGES.position.max}
            step={0.5}
            suffix="%"
            onChange={(x) => onPatch({ x }, "x")}
          />
        </Field>
        <Field label="Y" htmlFor={yId}>
          <NumberInput
            id={yId}
            value={layer.y}
            min={RANGES.position.min}
            max={RANGES.position.max}
            step={0.5}
            suffix="%"
            onChange={(y) => onPatch({ y }, "y")}
          />
        </Field>
        {showWidth && (
          <Field label="Width" htmlFor={wId}>
            <NumberInput
              id={wId}
              value={layer.width}
              min={RANGES.width.min}
              max={RANGES.width.max}
              step={0.5}
              suffix="%"
              onChange={(width) => onPatch({ width }, "width")}
            />
          </Field>
        )}
      </div>
      <div className="dz-row">
        <button type="button" className="dz-btn dz-btn-sm dz-grow" onClick={() => onCenter("x")}>
          <IconCenterH size={15} />
          <span>Centre across</span>
        </button>
        <button type="button" className="dz-btn dz-btn-sm dz-grow" onClick={() => onCenter("y")}>
          <IconCenterV size={15} />
          <span>Centre down</span>
        </button>
      </div>
      <SliderField
        label="Rotation"
        value={layer.rotation}
        min={RANGES.rotation.min}
        max={RANGES.rotation.max}
        step={1}
        decimals={1}
        suffix="°"
        onChange={(rotation) => onPatch({ rotation }, "rotation")}
        aside={
          <IconButton label="Reset rotation" onClick={() => onPatch({ rotation: 0 }, "rotation")} disabled={!layer.rotation}>
            <IconRotate size={14} />
          </IconButton>
        }
      />
      <SliderField
        label="Opacity"
        value={round(layer.opacity * 100, 0)}
        min={0}
        max={100}
        step={1}
        decimals={0}
        suffix="%"
        onChange={(v) => onPatch({ opacity: round(v / 100, 2) }, "opacity")}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------

function CardProperties({
  design,
  assets,
  assetUrl,
  swatches,
  onBackground,
  onBackgroundImage,
  onAspect,
}: PropertiesPanelProps) {
  const bg = design.background;
  const preset = shapePresetFor(design.aspect_ratio);
  const lastFrame = useRef(bg.border_color ?? "#d9c6b3");
  if (bg.border_color) lastFrame.current = bg.border_color;
  const bgAsset = bg.image_asset_id ? assets.find((a) => a.id === bg.image_asset_id) : undefined;

  return (
    <>
      <PanelHeader title="Card" />
      <p className="dz-hint dz-panel-intro">Select something on the card to edit it, or set up the card itself here.</p>

      <Section title="Shape">
        <div className="dz-shapes" role="group" aria-label="Card shape">
          {SHAPE_PRESETS.map((p) => {
            const tall = p.ratio >= 1;
            const active = preset?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className="dz-shape"
                aria-pressed={active}
                onClick={() => onAspect(p.ratio)}
                title={`${p.label} (${p.detail})`}
              >
                <span
                  className="dz-shape-icon"
                  aria-hidden="true"
                  style={{ width: tall ? 22 / p.ratio : 22, height: tall ? 22 : 22 * p.ratio }}
                />
                <span className="dz-shape-label">{p.label}</span>
                <span className="dz-shape-detail">{p.detail}</span>
              </button>
            );
          })}
        </div>
        <p className="dz-hint">
          {preset ? `Current: ${preset.label} (${preset.detail}).` : `Current: custom (height ${round(design.aspect_ratio, 3)} × width).`}{" "}
          Changing the shape rescales your layout to fit.
        </p>
      </Section>

      <Section title="Background">
        <ColorField
          label="Colour"
          value={bg.color}
          swatches={swatches}
          onChange={(color) => onBackground({ color }, "color")}
        />
        <Field label="Image">
          {bg.image_asset_id ? (
            <div className="dz-bg-image">
              <img className="dz-bg-thumb" src={assetUrl(bg.image_asset_id)} alt="" draggable={false} />
              <div className="dz-bg-image-actions">
                {bgAsset && <span className="dz-hint dz-truncate">{bgAsset.filename}</span>}
                <div className="dz-row">
                  <button type="button" className="dz-btn dz-btn-sm" onClick={onBackgroundImage}>
                    Change
                  </button>
                  <button
                    type="button"
                    className="dz-btn dz-btn-sm dz-btn-danger-ghost"
                    onClick={() => onBackground({ image_asset_id: null }, "image")}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button type="button" className="dz-btn dz-btn-block" onClick={onBackgroundImage}>
              <IconImage />
              <span>Add background image</span>
            </button>
          )}
        </Field>
        {bg.image_asset_id && (
          <>
            <Field label="Fit">
              <Segmented
                label="Image fit"
                value={bg.image_fit}
                onChange={(image_fit) => onBackground({ image_fit }, "fit")}
                options={[
                  { value: "cover", label: "Fill card" },
                  { value: "contain", label: "Show whole image" },
                ]}
              />
            </Field>
            <SliderField
              label="Image opacity"
              value={round(bg.image_opacity * 100, 0)}
              min={0}
              max={100}
              step={1}
              decimals={0}
              suffix="%"
              onChange={(v) => onBackground({ image_opacity: round(v / 100, 2) }, "image_opacity")}
            />
          </>
        )}
      </Section>

      <Section title="Frame">
        <Switch
          checked={!!bg.border_color}
          onChange={(on) => onBackground({ border_color: on ? lastFrame.current : null }, "frame")}
          label="Thin frame around the card"
        />
        {bg.border_color && (
          <ColorField
            label="Frame colour"
            value={bg.border_color}
            swatches={swatches}
            onChange={(border_color) => onBackground({ border_color }, "frame_color")}
          />
        )}
      </Section>
    </>
  );
}
