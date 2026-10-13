// Public interface of the invitation card designer. The rest of the app imports
// only from here. The prop types below are fixed; implementations live in sibling
// files and are re-exported.
import type { CSSProperties } from "react";
import type { EmailStyle, EnvelopeStyle, FontOption, InvitationDesign, MediaAsset, Placeholder } from "./types";
import "./designer.css";

export * from "./types";

export interface CardRendererProps {
  /** Usually already personalised by the API (RSVP page, previews). */
  design: InvitationDesign;
  /** Fonts the design uses; the renderer loads them. */
  fonts: FontOption[];
  /** Turn a media asset id into an image URL. */
  assetUrl: (assetId: string) => string;
  /** Replace {{placeholders}} client-side (designer previews). Omit to show text as-is. */
  values?: Record<string, string>;
  /** The card fills its container's width; height follows the aspect ratio. */
  className?: string;
  style?: CSSProperties;
}

/** Read-only, responsive rendering of a card. */
export { CardRenderer } from "./CardRenderer";

export interface CardDesignerProps {
  design: InvitationDesign;
  onChange: (design: InvitationDesign) => void;
  fonts: FontOption[];
  placeholders: Placeholder[];
  /** Example values (couple names, event date, ...) to preview placeholders while designing. */
  sampleValues: Record<string, string>;
  /** Images uploaded for this wedding. */
  assets: MediaAsset[];
  /** Upload an image and resolve with the stored asset (the caller refreshes `assets`). */
  onUploadImage: (file: File) => Promise<MediaAsset>;
  assetUrl: (assetId: string) => string;
  readOnly?: boolean;
}

/** Interactive canvas editor for the card: background, text and image layers. */
export { CardDesigner } from "./CardDesigner";

export interface EmailStyleEditorProps {
  value: EmailStyle;
  onChange: (value: EmailStyle) => void;
  fonts: FontOption[];
  assets: MediaAsset[];
  onUploadImage: (file: File) => Promise<MediaAsset>;
  assetUrl: (assetId: string) => string;
  readOnly?: boolean;
}

/** Controls for the email's look: header image, colours, font, button text. */
export { EmailStyleEditor } from "./EmailStyleEditor";

export interface EnvelopeStyleEditorProps {
  value: EnvelopeStyle;
  onChange: (value: EnvelopeStyle) => void;
  /** The card's accent and paper, which the envelope follows unless told otherwise. */
  accentColor: string;
  paperColor: string;
  /** For the preview and the default initials. */
  coupleNames: string;
  weddingDate?: string | null;
  fonts: FontOption[];
  readOnly?: boolean;
}

/** Controls for the envelope guests open first: paper, wax, ink, initials, stamp and the hint, with a preview. */
export { EnvelopeStyleEditor } from "./EnvelopeStyleEditor";

/** Make the card typefaces (bundled with the app) available while a card is on screen. */
export { useWebFonts } from "./fonts";

/** Replace {{placeholder}} markers using `values`; unknown markers are left untouched. */
export { fillPlaceholders } from "./placeholders";

// Extras (additive): validation helpers the rest of the app may find useful.
/** Clamp a design into the API's validation rules (ranges, colours, fonts, ids, layer count). */
export { normalizeDesign } from "./model";
