// Mirrors backend/app/modules/invitations/design.py and media/schemas.py.
// Positions/widths are % of the card; font sizes are px on a 600px-wide card.

export const DESIGN_WIDTH_PX = 600;

export type FontCategory = "serif" | "sans-serif" | "script";

export interface FontOption {
  family: string;
  category: FontCategory;
  /** CSS font-family stack, starting with the web font. */
  fallback: string;
  weights: number[];
  italic: boolean;
  /** `family=` value for https://fonts.googleapis.com/css2 */
  google_spec: string;
}

export interface Placeholder {
  name: string;
  description: string;
}

export interface MediaAsset {
  id: string;
  wedding_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  /** Relative, public URL (e.g. /api/v1/public/media/<id>). */
  url: string;
}

interface PlacedLayer {
  id: string;
  /** Left edge, % of card width (-50..150). */
  x: number;
  /** Top edge, % of card height (-50..150). */
  y: number;
  /** % of card width (0..200]. */
  width: number;
  /** Degrees, -180..180. */
  rotation: number;
  /** 0..1 */
  opacity: number;
}

export interface TextLayer extends PlacedLayer {
  type: "text";
  /** May contain {{placeholders}}; newlines are line breaks. */
  text: string;
  font_family: string;
  /** px at a 600px-wide card (4..200). */
  font_size: number;
  /** 100..900 */
  font_weight: number;
  italic: boolean;
  /** #rrggbb */
  color: string;
  align: "left" | "center" | "right";
  /** 0.6..3 */
  line_height: number;
  /** em, -0.2..1 */
  letter_spacing: number;
  uppercase: boolean;
}

export interface ImageLayer extends PlacedLayer {
  type: "image";
  asset_id: string;
  /** % of the image's width, 0..50 (50 = circle for square images). */
  border_radius: number;
}

export type Layer = TextLayer | ImageLayer;

export interface CardBackground {
  color: string;
  image_asset_id: string | null;
  image_fit: "cover" | "contain";
  image_opacity: number;
  /** Optional thin frame inset from the card edge. */
  border_color: string | null;
}

export interface EmailStyle {
  header_asset_id: string | null;
  background_color: string;
  card_color: string;
  text_color: string;
  accent_color: string;
  font_family: string;
  /** 1..60 chars */
  button_text: string;
}

export interface InvitationDesign {
  version: 1;
  /** height / width, 0.5..2 (1.4 = 5x7 portrait). */
  aspect_ratio: number;
  background: CardBackground;
  /** Painted in order: later layers sit on top. Max 60. */
  layers: Layer[];
  email: EmailStyle;
}
