// Glue between the app and the invitation designer: example values, fonts, images.
import { useMemo } from "react";
import { assetUrl } from "../../api/client";
import type { InvitationDesign, Wedding, WeddingEvent } from "../../api/types";
import { useToast } from "../../components/Toasts";
import { formatLongDate, formatTime, parseDate, parseWallClock } from "../../lib/format";
import { useFonts, useMedia, usePlaceholders, useUploadImage } from "./api";

export { assetUrl };

/** Example values for {{placeholders}} while designing (the API fills real ones per guest). */
export function buildSampleValues(wedding: Wedding, event: WeddingEvent): Record<string, string> {
  const start = parseWallClock(event.starts_at);
  const date = start ?? parseDate(wedding.wedding_date);
  const eventDate = formatLongDate(date);
  const eventTime = formatTime(start);
  return {
    couple_names: wedding.couple_names,
    event_name: event.name,
    event_date: eventDate,
    event_time: eventTime,
    event_when: [eventDate, eventTime].filter(Boolean).join(" at "),
    venue_name: event.venue_name ?? "",
    venue_address: event.venue_address ?? "",
    event_details: event.details ?? "",
    rsvp_deadline: formatLongDate(parseDate(event.rsvp_deadline)),
    first_name: "Alex",
    last_name: "Example",
    full_name: "Alex Example",
    plus_one: "You are very welcome to bring a guest.",
    rsvp_link: "#",
  };
}

export function useSampleValues(wedding: Wedding, event: WeddingEvent) {
  return useMemo(() => buildSampleValues(wedding, event), [wedding, event]);
}

/** Fonts, placeholders, uploaded images and the upload handler the designer needs. */
export function useDesignerResources(weddingId: string) {
  const fonts = useFonts();
  const placeholders = usePlaceholders();
  const media = useMedia(weddingId);
  const upload = useUploadImage(weddingId);
  const toast = useToast();

  const onUploadImage = useMemo(
    () => async (file: File) => {
      try {
        return await upload(file);
      } catch (err) {
        toast.error(err);
        throw err;
      }
    },
    [upload, toast],
  );

  return {
    fonts: fonts.data ?? [],
    placeholders: placeholders.data ?? [],
    assets: media.data ?? [],
    onUploadImage,
    assetUrl,
    isLoading: fonts.isPending || placeholders.isPending,
    error: fonts.error ?? placeholders.error ?? null,
  };
}

/** Used only if a draft has no stored design (older data). Mirrors the API's email defaults. */
export function fallbackDesign(): InvitationDesign {
  return {
    version: 1,
    aspect_ratio: 1.4,
    background: {
      color: "#fbf7f2",
      image_asset_id: null,
      image_fit: "cover",
      image_opacity: 1,
      border_color: "#d9c6b3",
    },
    layers: [
      {
        id: "names",
        type: "text",
        x: 10,
        y: 36,
        width: 80,
        rotation: 0,
        opacity: 1,
        text: "{{couple_names}}",
        font_family: "Cormorant Garamond",
        font_size: 48,
        font_weight: 500,
        italic: false,
        color: "#4a3a2f",
        align: "center",
        line_height: 1.2,
        letter_spacing: 0,
        uppercase: false,
      },
      {
        id: "when",
        type: "text",
        x: 10,
        y: 56,
        width: 80,
        rotation: 0,
        opacity: 1,
        text: "{{event_when}}",
        font_family: "Cormorant Garamond",
        font_size: 20,
        font_weight: 400,
        italic: true,
        color: "#4a3a2f",
        align: "center",
        line_height: 1.3,
        letter_spacing: 0,
        uppercase: false,
      },
    ],
    email: {
      header_asset_id: null,
      background_color: "#f6f1eb",
      card_color: "#ffffff",
      text_color: "#3b302a",
      accent_color: "#7a5c4f",
      font_family: "Cormorant Garamond",
      button_text: "View your invitation",
    },
    envelope: {
      enabled: true,
      paper_color: null,
      seal_color: null,
      ink_color: "#1f5436",
      initials: "",
      stamp_text: "",
      hint: "Break the seal to open",
    },
  };
}
