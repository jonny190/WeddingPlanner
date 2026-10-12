// Starter templates. Authored on a 5x7 portrait card (aspect 1.4) and re-fitted to
// the card's current shape when applied.
import { pickFont } from "./fonts";
import { fitLayersToAspect } from "./geometry";
import { DEFAULT_EMAIL, fitToFont } from "./model";
import type { CardBackground, FontCategory, FontOption, InvitationDesign, Layer, TextLayer } from "./types";

export const TEMPLATE_ASPECT = 1.4;

type FontResolver = (family: string, category: FontCategory) => string;

interface TextSpec extends Partial<Omit<TextLayer, "id" | "type" | "text" | "y">> {
  font_family: string;
  font_size: number;
}

export interface CardTemplate {
  id: string;
  name: string;
  description: string;
  build: (font: FontResolver) => { background: CardBackground; layers: Layer[] };
}

function text(id: string, value: string, y: number, spec: TextSpec): TextLayer {
  return {
    id,
    type: "text",
    text: value,
    x: 10,
    y,
    width: 80,
    rotation: 0,
    opacity: 1,
    font_weight: 400,
    italic: false,
    color: "#3b302a",
    align: "center",
    line_height: 1.3,
    letter_spacing: 0,
    uppercase: false,
    ...spec,
  };
}

function background(color: string, border: string | null): CardBackground {
  return { color, image_asset_id: null, image_fit: "cover", image_opacity: 1, border_color: border };
}

export const TEMPLATES: CardTemplate[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Ivory card, fine frame and a flowing script for your names.",
    build: (font) => {
      const ink = "#4a3a2f";
      const soft = "#8a7566";
      const sans = font("Montserrat", "sans-serif");
      const serif = font("Cormorant Garamond", "serif");
      const script = font("Great Vibes", "script");
      const small = { font_family: sans, font_size: 11, letter_spacing: 0.25, uppercase: true, color: soft };
      return {
        background: background("#fbf7f2", "#d9c6b3"),
        layers: [
          text("for", "For {{full_name}}", 7, small),
          text("intro", "Together with their families", 15, { ...small, font_size: 12, letter_spacing: 0.2 }),
          text("names", "{{couple_names}}", 21, { font_family: script, font_size: 58, line_height: 1.1, color: ink }),
          text("invite", "request the pleasure of your company\nat their wedding", 40, {
            font_family: serif,
            font_size: 21,
            italic: true,
            color: ink,
          }),
          text("when", "{{event_when}}", 55, { font_family: serif, font_size: 23, font_weight: 600, color: ink }),
          text("venue", "{{venue_name}}\n{{venue_address}}", 63, { font_family: serif, font_size: 18, color: ink }),
          text("plus", "{{plus_one}}", 78, { font_family: serif, font_size: 17, italic: true, color: soft }),
          text("reply", "Kindly reply by {{rsvp_deadline}}", 86, { ...small, letter_spacing: 0.2 }),
        ],
      };
    },
  },
  {
    id: "modern",
    name: "Modern",
    description: "Deep charcoal with crisp sans-serif type and warm gold details.",
    build: (font) => {
      const light = "#f3eee7";
      const muted = "#b9b1a6";
      const gold = "#c8a97e";
      const sans = font("Montserrat", "sans-serif");
      const display = font("Playfair Display", "serif");
      const left = { x: 12, width: 76, align: "left" as const };
      const label = {
        ...left,
        font_family: sans,
        font_size: 11,
        font_weight: 500,
        letter_spacing: 0.3,
        uppercase: true,
        color: gold,
      };
      return {
        background: background("#1f2328", null),
        layers: [
          text("invited", "You’re invited", 10, { ...label, font_size: 12 }),
          text("names", "{{couple_names}}", 15, {
            ...left,
            font_family: display,
            font_size: 62,
            line_height: 1.05,
            color: light,
          }),
          text("invite", "are getting married and would love you\nto celebrate with them", 36, {
            ...left,
            font_family: sans,
            font_size: 15,
            font_weight: 300,
            line_height: 1.6,
            color: muted,
          }),
          text("when-label", "When", 52, label),
          text("when", "{{event_when}}", 55, { ...left, font_family: sans, font_size: 16, line_height: 1.45, color: light }),
          text("where-label", "Where", 64, label),
          text("venue", "{{venue_name}}\n{{venue_address}}", 67, {
            ...left,
            font_family: sans,
            font_size: 15,
            font_weight: 300,
            line_height: 1.55,
            color: light,
          }),
          text("plus", "{{plus_one}}", 79, { ...left, font_family: display, font_size: 17, italic: true, color: muted }),
          text("reply", "For {{full_name}}\nKindly reply by {{rsvp_deadline}}", 87, {
            ...label,
            font_size: 10.5,
            font_weight: 400,
            letter_spacing: 0.2,
            line_height: 1.8,
          }),
        ],
      };
    },
  },
  {
    id: "romantic",
    name: "Romantic Script",
    description: "Soft blush tones, elegant calligraphy and italic serif lines.",
    build: (font) => {
      const ink = "#6e4640";
      const soft = "#a07b72";
      const serif = font("Cormorant Garamond", "serif");
      const script = font("Pinyon Script", "script");
      const flourish = font("Great Vibes", "script");
      return {
        background: background("#f8eeea", "#d9b3a8"),
        layers: [
          text("dear", "Dear {{full_name}}", 8, { font_family: serif, font_size: 19, italic: true, color: soft }),
          text("intro", "Together with their families", 15, {
            font_family: serif,
            font_size: 13,
            font_weight: 500,
            letter_spacing: 0.25,
            uppercase: true,
            color: soft,
          }),
          text("names", "{{couple_names}}", 20, { font_family: script, font_size: 62, line_height: 1.15, color: ink }),
          text("invite", "invite you to share in their joy\nas they exchange vows", 41, {
            font_family: serif,
            font_size: 21,
            italic: true,
            line_height: 1.35,
            color: ink,
          }),
          text("when", "{{event_when}}", 54, {
            font_family: serif,
            font_size: 20,
            font_weight: 600,
            letter_spacing: 0.08,
            uppercase: true,
            color: ink,
          }),
          text("venue", "{{venue_name}}\n{{venue_address}}", 62, {
            font_family: serif,
            font_size: 18,
            line_height: 1.4,
            color: ink,
          }),
          text("plus", "{{plus_one}}", 75, { font_family: flourish, font_size: 26, color: soft }),
          text("reply", "Kindly reply by {{rsvp_deadline}}", 87, {
            font_family: serif,
            font_size: 16,
            italic: true,
            color: soft,
          }),
        ],
      };
    },
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean white space, light type and quiet details.",
    build: (font) => {
      const ink = "#2b2b2b";
      const muted = "#8d8d8d";
      const sans = font("Raleway", "sans-serif");
      const serif = font("Cormorant Garamond", "serif");
      const narrow = { x: 12, width: 76 };
      const small = {
        ...narrow,
        font_family: sans,
        font_size: 10.5,
        letter_spacing: 0.3,
        uppercase: true,
        color: muted,
      };
      return {
        background: background("#ffffff", null),
        layers: [
          text("for", "For {{full_name}}", 9, small),
          text("names", "{{couple_names}}", 28, {
            ...narrow,
            font_family: serif,
            font_size: 46,
            font_weight: 300,
            line_height: 1.1,
            letter_spacing: 0.02,
            color: ink,
          }),
          text("sub", "are getting married", 44, { ...small, font_size: 12, letter_spacing: 0.32 }),
          text("when", "{{event_when}}", 57, {
            ...narrow,
            font_family: sans,
            font_size: 14,
            letter_spacing: 0.06,
            color: ink,
          }),
          text("venue", "{{venue_name}}\n{{venue_address}}", 62, {
            ...narrow,
            font_family: sans,
            font_size: 13,
            font_weight: 300,
            line_height: 1.7,
            color: ink,
          }),
          text("plus", "{{plus_one}}", 74, { ...narrow, font_family: serif, font_size: 17, italic: true, color: muted }),
          text("reply", "Please reply by {{rsvp_deadline}}", 88, { ...small, letter_spacing: 0.25 }),
        ],
      };
    },
  },
];

/** A template's background and layers, using fonts from the catalog and fitted to `aspectRatio`. */
export function buildTemplate(
  template: CardTemplate,
  fonts: readonly FontOption[],
  aspectRatio: number,
): { background: CardBackground; layers: Layer[] } {
  const built = template.build((family, category) => pickFont(fonts, [family], category));
  const layers = built.layers.map((l) => (l.type === "text" ? fitToFont(l, fonts) : l));
  return { background: built.background, layers: fitLayersToAspect(layers, TEMPLATE_ASPECT, aspectRatio) };
}

/** A complete design for previewing a template. */
export function templatePreview(
  template: CardTemplate,
  fonts: readonly FontOption[],
  aspectRatio: number,
): InvitationDesign {
  return { version: 1, aspect_ratio: aspectRatio, ...buildTemplate(template, fonts, aspectRatio), email: DEFAULT_EMAIL };
}
