import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, downloadFile } from "../../api/client";
import { invalidateWedding, qk } from "../../api/queryKeys";
import type { BulkResult, Engagement, EventReplySummary, ReplyRow, ReplyUpdate, RsvpStatus } from "../../api/types";

export interface ReplyFilters {
  status: RsvpStatus | "";
  engagement: Engagement | "";
}

export function useReplies(weddingId: string, eventId: string, filters: ReplyFilters) {
  return useQuery({
    queryKey: qk.replies(weddingId, eventId, filters),
    queryFn: () =>
      api.get<ReplyRow[]>(`/weddings/${weddingId}/events/${eventId}/replies`, {
        status: filters.status,
        engagement: filters.engagement,
      }),
  });
}

export function useReplySummary(weddingId: string, eventId: string) {
  return useQuery({
    queryKey: qk.repliesSummary(weddingId, eventId),
    queryFn: () => api.get<EventReplySummary>(`/weddings/${weddingId}/events/${eventId}/replies/summary`),
  });
}

export function useRecordReply(weddingId: string, eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ guestId, data }: { guestId: string; data: ReplyUpdate }) =>
      api.put<ReplyRow>(`/weddings/${weddingId}/events/${eventId}/replies/${guestId}`, data),
    onSuccess: () =>
      invalidateWedding(qc, weddingId, "replies", "replies-summary", "summary", "guests", "seating", "menu-choices"),
  });
}

export function useMarkSent(weddingId: string, eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (guestIds: string[]) =>
      api.post<BulkResult>(`/weddings/${weddingId}/events/${eventId}/invitations/mark-sent`, { guest_ids: guestIds }),
    onSuccess: () =>
      invalidateWedding(qc, weddingId, "replies", "replies-summary", "summary", "guests", "deliveries"),
  });
}

export function exportReplies(weddingId: string, eventId: string) {
  return downloadFile(`/weddings/${weddingId}/events/${eventId}/replies/export`, "replies.csv");
}
