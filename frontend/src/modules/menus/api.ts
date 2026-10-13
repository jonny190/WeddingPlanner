import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, downloadFile } from "../../api/client";
import { invalidateWedding, qk } from "../../api/queryKeys";
import type { GuestChoiceRow, Menu, MenuChoiceSets, MenuChoicesReport, MenuUpdate } from "../../api/types";

export function useMenu(weddingId: string, eventId: string) {
  return useQuery({
    queryKey: qk.menu(weddingId, eventId),
    queryFn: () => api.get<Menu>(`/weddings/${weddingId}/events/${eventId}/menu`),
  });
}

export function useSaveMenu(weddingId: string, eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MenuUpdate) => api.put<Menu>(`/weddings/${weddingId}/events/${eventId}/menu`, data),
    onSuccess: () => invalidateWedding(qc, weddingId, "menu", "menu-choices"),
  });
}

export function useMenuChoices(weddingId: string, eventId: string) {
  return useQuery({
    queryKey: qk.menuChoices(weddingId, eventId),
    queryFn: () => api.get<MenuChoicesReport>(`/weddings/${weddingId}/events/${eventId}/menu/choices`),
  });
}

export function useRecordChoices(weddingId: string, eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ guestId, data }: { guestId: string; data: MenuChoiceSets }) =>
      api.put<GuestChoiceRow>(`/weddings/${weddingId}/events/${eventId}/menu/choices/${guestId}`, data),
    onSuccess: () => invalidateWedding(qc, weddingId, "menu-choices"),
  });
}

export function exportChoices(weddingId: string, eventId: string) {
  return downloadFile(`/weddings/${weddingId}/events/${eventId}/menu/choices/export`, "menu-choices.csv");
}
