import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { qk } from "../../api/queryKeys";
import type {
  EventInput,
  Wedding,
  WeddingCreate,
  WeddingEvent,
  WeddingSummary,
  WeddingUpdate,
} from "../../api/types";

export function useWeddings() {
  return useQuery({ queryKey: qk.weddings, queryFn: () => api.get<Wedding[]>("/weddings") });
}

export function useWeddingQuery(weddingId: string) {
  return useQuery({
    queryKey: qk.wedding(weddingId),
    queryFn: () => api.get<Wedding>(`/weddings/${weddingId}`),
  });
}

export function useWeddingSummary(weddingId: string) {
  return useQuery({
    queryKey: qk.summary(weddingId),
    queryFn: () => api.get<WeddingSummary>(`/weddings/${weddingId}/summary`),
  });
}

export function useCreateWedding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: WeddingCreate) => api.post<Wedding>("/weddings", data),
    onSuccess: (wedding) => {
      qc.setQueryData(qk.wedding(wedding.id), wedding);
      void qc.invalidateQueries({ queryKey: qk.weddings });
    },
  });
}

export function useUpdateWedding(weddingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: WeddingUpdate) => api.patch<Wedding>(`/weddings/${weddingId}`, data),
    onSuccess: (wedding) => {
      qc.setQueryData(qk.wedding(weddingId), wedding);
      void qc.invalidateQueries({ queryKey: qk.weddings });
    },
  });
}

export function useDeleteWedding(weddingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/weddings/${weddingId}`),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["w", weddingId] });
      void qc.invalidateQueries({ queryKey: qk.weddings });
    },
  });
}

/** Events affect almost every screen, so refresh the whole wedding afterwards. */
function useEventMutation<TVars, TResult>(weddingId: string, fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["w", weddingId] });
      void qc.invalidateQueries({ queryKey: qk.weddings });
    },
  });
}

export function useCreateEvent(weddingId: string) {
  return useEventMutation(weddingId, (data: EventInput) =>
    api.post<WeddingEvent>(`/weddings/${weddingId}/events`, data),
  );
}

export function useUpdateEvent(weddingId: string) {
  return useEventMutation(weddingId, ({ id, data }: { id: string; data: Partial<EventInput> }) =>
    api.patch<WeddingEvent>(`/weddings/${weddingId}/events/${id}`, data),
  );
}

export function useDeleteEvent(weddingId: string) {
  return useEventMutation(weddingId, (eventId: string) => api.delete(`/weddings/${weddingId}/events/${eventId}`));
}
