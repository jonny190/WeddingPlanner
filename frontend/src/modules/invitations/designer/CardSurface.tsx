// The single rendering implementation of a card, shared by CardRenderer (read-only)
// and the designer canvas so both always look identical.
import { memo, type CSSProperties, type Ref } from "react";
import { fontStack } from "./fonts";
import { fillPlaceholders } from "./placeholders";
import type { FontOption, ImageLayer, InvitationDesign, Layer, TextLayer } from "./types";
import { DESIGN_WIDTH_PX } from "./types";

/** Geometry shared by every layer: % of the card, rotated about its centre. */
export function layerBoxStyle(layer: Layer, opacity: number = layer.opacity): CSSProperties {
  return {
    position: "absolute",
    left: `${layer.x}%`,
    top: `${layer.y}%`,
    width: `${layer.width}%`,
    transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
    transformOrigin: "center",
    opacity,
  };
}

/** Typography of a text layer. Sizes scale with the card through container query units. */
export function textStyle(layer: TextLayer, fonts: readonly FontOption[]): CSSProperties {
  return {
    fontSize: `calc(${layer.font_size} / ${DESIGN_WIDTH_PX} * 100cqw)`,
    fontFamily: fontStack(layer.font_family, fonts),
    fontWeight: layer.font_weight,
    fontStyle: layer.italic ? "italic" : "normal",
    color: layer.color,
    textAlign: layer.align,
    lineHeight: layer.line_height,
    letterSpacing: `${layer.letter_spacing}em`,
    textTransform: layer.uppercase ? "uppercase" : "none",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
  };
}

/**
 * Corner radius as a percentage of the image's width (design.py), so corners stay
 * circular on non-square images: 50 on a square image is a circle.
 */
export function imageRadius(layer: ImageLayer): string | undefined {
  if (!layer.border_radius) return undefined;
  return `${(layer.border_radius * layer.width) / 100}cqw`;
}

/** Text shown for a layer: placeholders filled (and trimmed, as the API does) when values are given. */
export function displayText(layer: TextLayer, values?: Record<string, string>): string {
  return values ? fillPlaceholders(layer.text, values).trim() : layer.text;
}

interface LayerViewProps {
  layer: Layer;
  fonts: readonly FontOption[];
  assetUrl: (assetId: string) => string;
  values?: Record<string, string>;
  hidden?: boolean;
}

const LayerView = memo(function LayerView({ layer, fonts, assetUrl, values, hidden }: LayerViewProps) {
  const box = layerBoxStyle(layer);
  if (hidden) box.visibility = "hidden";
  if (layer.type === "text") {
    return (
      <div className="dz-layer dz-layer-text" data-layer-id={layer.id} style={{ ...box, ...textStyle(layer, fonts) }}>
        {displayText(layer, values)}
      </div>
    );
  }
  return (
    <div className="dz-layer dz-layer-image" data-layer-id={layer.id} style={box}>
      <img
        src={assetUrl(layer.asset_id)}
        alt=""
        draggable={false}
        style={{ width: "100%", height: "auto", display: "block", borderRadius: imageRadius(layer) }}
      />
    </div>
  );
});

export interface CardSurfaceProps {
  design: InvitationDesign;
  fonts: readonly FontOption[];
  assetUrl: (assetId: string) => string;
  values?: Record<string, string>;
  className?: string;
  style?: CSSProperties;
  /** A layer to hide (the designer hides the one being edited in place). */
  hiddenLayerId?: string | null;
  cardRef?: Ref<HTMLDivElement>;
  "aria-hidden"?: boolean;
}

export function CardSurface({
  design,
  fonts,
  assetUrl,
  values,
  className,
  style,
  hiddenLayerId,
  cardRef,
  "aria-hidden": ariaHidden,
}: CardSurfaceProps) {
  const bg = design.background;
  return (
    <div
      ref={cardRef}
      className={className ? `dz-card ${className}` : "dz-card"}
      aria-hidden={ariaHidden || undefined}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `1 / ${design.aspect_ratio}`,
        overflow: "hidden",
        containerType: "inline-size",
        backgroundColor: bg.color,
        ...style,
      }}
    >
      {bg.image_asset_id && (
        <img
          className="dz-card-bg"
          src={assetUrl(bg.image_asset_id)}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: bg.image_fit,
            opacity: bg.image_opacity,
          }}
        />
      )}
      {bg.border_color && (
        <div
          className="dz-card-frame"
          style={{
            position: "absolute",
            // 3% of the card's width on every side, so the frame margin is even on any shape.
            inset: "3cqw",
            border: `1px solid ${bg.border_color}`,
            pointerEvents: "none",
          }}
        />
      )}
      {design.layers.map((layer) => (
        <LayerView
          key={layer.id}
          layer={layer}
          fonts={fonts}
          assetUrl={assetUrl}
          values={values}
          hidden={layer.id === hiddenLayerId}
        />
      ))}
    </div>
  );
}
