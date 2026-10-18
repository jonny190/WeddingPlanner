import type { QueryClient } from "@tanstack/react-query";

// Everything about one wedding lives under ["w", weddingId, section, ...], so a
// mutation can refresh exactly the sections it affects.
export type WeddingSection =
  | "detail"
  | "summary"
  | "guests"
  | "seating"
  | "constraints"
  | "drafts"
  | "deliveries"
  | "replies"
  | "replies-summary"
  | "media"
  | "menu"
  | "menu-choices"
  | "venues";

export const qk = {
  weddings: ["weddings"] as const,
  wedding: (wid: string) => ["w", wid, "detail"] as const,
  summary: (wid: string) => ["w", wid, "summary"] as const,
  guests: (wid: string) => ["w", wid, "guests"] as const,
  seating: (wid: string, eid: string) => ["w", wid, "seating", eid] as const,
  constraints: (wid: string) => ["w", wid, "constraints"] as const,
  drafts: (wid: string, eid: string) => ["w", wid, "drafts", eid] as const,
  preview: (wid: string, eid: string, did: string, input: unknown) =>
    ["w", wid, "drafts", eid, did, "preview", input] as const,
  deliveries: (wid: string, eid: string) => ["w", wid, "deliveries", eid] as const,
  replies: (wid: string, eid: string, filters: { status: string; engagement: string }) =>
    ["w", wid, "replies", eid, filters] as const,
  repliesSummary: (wid: string, eid: string) => ["w", wid, "replies-summary", eid] as const,
  media: (wid: string) => ["w", wid, "media"] as const,
  menu: (wid: string, eid: string) => ["w", wid, "menu", eid] as const,
  menuChoices: (wid: string, eid: string) => ["w", wid, "menu-choices", eid] as const,
  venues: (wid: string) => ["w", wid, "venues"] as const,
  fonts: ["invitation-fonts"] as const,
  channels: ["invitation-channels"] as const,
  placeholders: ["invitation-placeholders"] as const,
  members: ["tenant", "members"] as const,
  invites: ["tenant", "invites"] as const,
  apiKeys: ["tenant", "api-keys"] as const,
  invite: (token: string) => ["public", "invite", token] as const,
  rsvp: (token: string) => ["public", "rsvp", token] as const,
};

/** Mark sections of a wedding as stale (active queries refetch straight away). */
export function invalidateWedding(qc: QueryClient, wid: string, ...sections: WeddingSection[]) {
  return Promise.all(sections.map((section) => qc.invalidateQueries({ queryKey: ["w", wid, section] })));
}

/** Sections that depend on guests and their invitations/replies. */
export const GUEST_DEPENDENT: WeddingSection[] = [
  "guests",
  "summary",
  "seating",
  "constraints",
  "replies",
  "replies-summary",
  "menu-choices",
];
