import { useCallback } from "react";
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { invalidateWedding, qk } from "../../api/queryKeys";
import type {
  BulkResult,
  Delivery,
  Draft,
  DraftCreate,
  DraftUpdate,
  FontOption,
  MediaAsset,
  Placeholder,
  PreviewRequest,
  PreviewResponse,
  SendRequest,
  SendResult,
  TestSendRequest,
  WeddingEvent,
} from "../../api/types";

const draftsPath = (wid: string, eid: string) => `/weddings/${wid}/events/${eid}/invitation-drafts`;

export function useDrafts(weddingId: string, eventId: string | null) {
  return useQuery({
    queryKey: qk.drafts(weddingId, eventId ?? ""),
    queryFn: () => api.get<Draft[]>(draftsPath(weddingId, eventId!)),
    enabled: Boolean(eventId),
  });
}

/** Drafts of every event (for "copy from another draft"). */
export function useAllDrafts(weddingId: string, events: WeddingEvent[]) {
  return useQueries({
    queries: events.map((e) => ({
      queryKey: qk.drafts(weddingId, e.id),
      queryFn: () => api.get<Draft[]>(draftsPath(weddingId, e.id)),
    })),
    combine: (results) => ({
      drafts: results.flatMap((r) => r.data ?? []),
      isPending: results.some((r) => r.isPending),
    }),
  });
}

export function useCreateDraft(weddingId: string, eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DraftCreate) => api.post<Draft>(draftsPath(weddingId, eventId), data),
    onSuccess: (draft) => {
      qc.setQueryData<Draft[]>(qk.drafts(weddingId, eventId), (list) => (list ? [...list, draft] : [draft]));
      void qc.invalidateQueries({ queryKey: qk.drafts(weddingId, eventId) });
    },
  });
}

export function useUpdateDraft(weddingId: string, eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DraftUpdate }) =>
      api.patch<Draft>(`${draftsPath(weddingId, eventId)}/${id}`, data),
    onSuccess: (draft) => {
      qc.setQueryData<Draft[]>(qk.drafts(weddingId, eventId), (list) =>
        list?.map((d) => (d.id === draft.id ? draft : d)),
      );
    },
  });
}

export function useDeleteDraft(weddingId: string, eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`${draftsPath(weddingId, eventId)}/${id}`),
    onSuccess: (_r, id) => {
      qc.setQueryData<Draft[]>(qk.drafts(weddingId, eventId), (list) => list?.filter((d) => d.id !== id));
    },
  });
}

/** Server-rendered preview of a draft, including unsaved edits. */
export function usePreview(
  weddingId: string,
  eventId: string,
  draftId: string,
  input: PreviewRequest,
  enabled: boolean,
) {
  return useQuery({
    queryKey: qk.preview(weddingId, eventId, draftId, input),
    queryFn: () => api.post<PreviewResponse>(`${draftsPath(weddingId, eventId)}/${draftId}/preview`, input),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useSendDraft(weddingId: string, eventId: string, draftId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SendRequest) => api.post<SendResult>(`${draftsPath(weddingId, eventId)}/${draftId}/send`, data),
    onSuccess: (result) => {
      if (!result.dry_run) {
        void invalidateWedding(qc, weddingId, "drafts", "deliveries", "replies", "replies-summary", "summary", "guests");
      }
    },
  });
}

export function useSendTest(weddingId: string, eventId: string, draftId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TestSendRequest) =>
      api.post<Delivery>(`${draftsPath(weddingId, eventId)}/${draftId}/send-test`, data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.deliveries(weddingId, eventId) }),
  });
}

/** Delivery log for an event. Polls while anything is waiting for the background worker. */
export function useDeliveries(weddingId: string, eventId: string) {
  return useQuery({
    queryKey: qk.deliveries(weddingId, eventId),
    queryFn: () => api.get<Delivery[]>(`/weddings/${weddingId}/deliveries`, { event_id: eventId }),
    refetchInterval: (query) =>
      query.state.data?.some((d) => d.status === "queued" || d.status === "sending") ? 4000 : false,
  });
}

export function useRetryFailed(weddingId: string, eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<BulkResult>(`/weddings/${weddingId}/events/${eventId}/deliveries/retry-failed`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.deliveries(weddingId, eventId) }),
  });
}

export function useFonts() {
  return useQuery({
    queryKey: qk.fonts,
    queryFn: () => api.get<FontOption[]>("/invitation-fonts"),
    staleTime: Infinity,
  });
}

export function usePlaceholders() {
  return useQuery({
    queryKey: qk.placeholders,
    queryFn: () => api.get<Placeholder[]>("/invitation-placeholders"),
    staleTime: Infinity,
  });
}

export function useMedia(weddingId: string) {
  return useQuery({
    queryKey: qk.media(weddingId),
    queryFn: () => api.get<MediaAsset[]>(`/weddings/${weddingId}/media`),
  });
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/** Upload an image for this wedding; resolves with the stored asset. */
export function useUploadImage(weddingId: string) {
  const qc = useQueryClient();
  return useCallback(
    async (file: File): Promise<MediaAsset> => {
      if (!IMAGE_TYPES.includes(file.type)) throw new Error("Please choose a PNG, JPEG, GIF or WebP image.");
      if (file.size > MAX_UPLOAD_BYTES) throw new Error("That image is larger than 8 MB. Please choose a smaller one.");
      const asset = await api.upload<MediaAsset>(`/weddings/${weddingId}/media`, file);
      qc.setQueryData<MediaAsset[]>(qk.media(weddingId), (list) => (list ? [asset, ...list] : [asset]));
      await qc.invalidateQueries({ queryKey: qk.media(weddingId) });
      return asset;
    },
    [qc, weddingId],
  );
}
