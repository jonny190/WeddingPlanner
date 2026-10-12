import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, downloadFile } from "../../api/client";
import { GUEST_DEPENDENT, invalidateWedding, qk } from "../../api/queryKeys";
import type {
  BulkResult,
  EventInvitation,
  Guest,
  GuestInput,
  ImportResult,
  WeddingEvent,
} from "../../api/types";

export function useGuests(weddingId: string) {
  return useQuery({
    queryKey: qk.guests(weddingId),
    queryFn: () => api.get<Guest[]>(`/weddings/${weddingId}/guests`),
  });
}

function refreshGuestViews(qc: QueryClient, weddingId: string) {
  return invalidateWedding(qc, weddingId, ...GUEST_DEPENDENT);
}

export function useCreateGuest(weddingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: GuestInput) => api.post<Guest>(`/weddings/${weddingId}/guests`, data),
    onSuccess: () => refreshGuestViews(qc, weddingId),
  });
}

export function useUpdateGuest(weddingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<GuestInput> }) =>
      api.patch<Guest>(`/weddings/${weddingId}/guests/${id}`, data),
    onSuccess: () => refreshGuestViews(qc, weddingId),
  });
}

export function useDeleteGuest(weddingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (guestId: string) => api.delete(`/weddings/${weddingId}/guests/${guestId}`),
    onSuccess: () => refreshGuestViews(qc, weddingId),
  });
}

function patchGuest(qc: QueryClient, weddingId: string, guestId: string, fn: (g: Guest) => Guest) {
  qc.setQueryData<Guest[]>(qk.guests(weddingId), (list) => list?.map((g) => (g.id === guestId ? fn(g) : g)));
}

const OTHER_SECTIONS = GUEST_DEPENDENT.filter((s) => s !== "guests");

interface InvitationVars {
  guestId: string;
  eventId: string;
}

/** Invite a guest to an event, or change their plus-one (optimistic). */
export function useSetInvitation(weddingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ guestId, eventId, plusOne }: InvitationVars & { plusOne: boolean }) =>
      api.put<EventInvitation>(`/weddings/${weddingId}/guests/${guestId}/invitations/${eventId}`, {
        plus_one_allowed: plusOne,
      }),
    onMutate: async ({ guestId, eventId, plusOne }) => {
      await qc.cancelQueries({ queryKey: qk.guests(weddingId) });
      const previous = qc.getQueryData<Guest[]>(qk.guests(weddingId));
      patchGuest(qc, weddingId, guestId, (g) => {
        const existing = g.invitations.find((i) => i.event_id === eventId);
        const invitations = existing
          ? g.invitations.map((i) =>
              i.event_id === eventId
                ? {
                    ...i,
                    plus_one_allowed: plusOne,
                    ...(plusOne ? {} : { plus_one_attending: null, plus_one_name: null, plus_one_dietary: null }),
                  }
                : i,
            )
          : [...g.invitations, placeholderInvitation(guestId, eventId, plusOne)];
        return { ...g, invitations };
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.guests(weddingId), ctx.previous);
      // Other toggles may have been in flight; fetch the truth.
      void qc.invalidateQueries({ queryKey: qk.guests(weddingId) });
    },
    onSuccess: (invitation, { guestId, eventId }) => {
      patchGuest(qc, weddingId, guestId, (g) => ({
        ...g,
        invitations: [...g.invitations.filter((i) => i.event_id !== eventId), invitation],
      }));
      void invalidateWedding(qc, weddingId, ...OTHER_SECTIONS);
    },
  });
}

/** Uninvite a guest from an event (optimistic). */
export function useRemoveInvitation(weddingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ guestId, eventId }: InvitationVars) =>
      api.delete(`/weddings/${weddingId}/guests/${guestId}/invitations/${eventId}`),
    onMutate: async ({ guestId, eventId }) => {
      await qc.cancelQueries({ queryKey: qk.guests(weddingId) });
      const previous = qc.getQueryData<Guest[]>(qk.guests(weddingId));
      patchGuest(qc, weddingId, guestId, (g) => ({
        ...g,
        invitations: g.invitations.filter((i) => i.event_id !== eventId),
      }));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.guests(weddingId), ctx.previous);
      // Other toggles may have been in flight; fetch the truth.
      void qc.invalidateQueries({ queryKey: qk.guests(weddingId) });
    },
    onSuccess: () => void invalidateWedding(qc, weddingId, ...OTHER_SECTIONS),
  });
}

function placeholderInvitation(guestId: string, eventId: string, plusOne: boolean): EventInvitation {
  return {
    id: `pending-${guestId}-${eventId}`,
    event_id: eventId,
    guest_id: guestId,
    plus_one_allowed: plusOne,
    rsvp_status: "pending",
    plus_one_attending: null,
    plus_one_name: null,
    plus_one_dietary: null,
    guest_message: null,
    responded_at: null,
    response_channel: null,
    first_sent_at: null,
    last_sent_at: null,
    first_clicked_at: null,
    last_clicked_at: null,
    click_count: 0,
  };
}

export function useBulkInvite(weddingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, guestIds, plusOne }: { eventId: string; guestIds: string[]; plusOne: boolean | null }) =>
      api.post<BulkResult>(`/weddings/${weddingId}/events/${eventId}/invitations/bulk`, {
        guest_ids: guestIds,
        plus_one_allowed: plusOne,
      }),
    onSuccess: () => refreshGuestViews(qc, weddingId),
  });
}

export function useBulkRemove(weddingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, guestIds }: { eventId: string; guestIds: string[] }) =>
      api.post<BulkResult>(`/weddings/${weddingId}/events/${eventId}/invitations/bulk-remove`, {
        guest_ids: guestIds,
      }),
    onSuccess: () => refreshGuestViews(qc, weddingId),
  });
}

export function useImportGuests(weddingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.upload<ImportResult>(`/weddings/${weddingId}/guests/import`, file),
    onSuccess: (result) => {
      if (result.created > 0) void refreshGuestViews(qc, weddingId);
    },
  });
}

export function exportGuests(weddingId: string) {
  return downloadFile(`/weddings/${weddingId}/guests/export`, "guests.csv");
}

// --- CSV helpers -----------------------------------------------------------------------------

function columnKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** The CSV column the importer uses for an event: its kind for the first of each kind, else its name. */
export function eventColumn(event: WeddingEvent, events: WeddingEvent[]): string {
  const firstOfKind = events.find((e) => e.kind === event.kind);
  return firstOfKind?.id === event.id ? event.kind : columnKey(event.name);
}

export function sampleCsv(events: WeddingEvent[]): string {
  const eventCols = events.flatMap((e) => {
    const key = eventColumn(e, events);
    return [key, `${key}_plus_one`];
  });
  const header = ["first_name", "last_name", "email", "phone", "group", "age_group", "dietary_requirements", "notes", ...eventCols];
  const rows = [
    ["Alex", "Example", "alex@example.com", "07700 900123", "Bride's family", "adult", "Vegetarian", "", ...events.flatMap((_, i) => (i === 0 ? ["yes", "yes"] : ["yes", "no"]))],
    ["Jamie", "Example", "", "", "Bride's family", "child", "", "Needs a high chair", ...events.flatMap(() => ["yes", "no"])],
    ["Morgan", "Friend", "morgan@example.com", "", "University", "adult", "", "", ...events.flatMap((_, i) => (i === 0 ? ["no", "no"] : ["yes", "no"]))],
  ];
  return [header, ...rows].map((r) => r.join(",")).join("\n") + "\n";
}
