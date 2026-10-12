import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiError, publicApi } from "../../api/client";
import { qk } from "../../api/queryKeys";
import type { LinkOpenResult, RsvpSubmit, RsvpView } from "../../api/types";

export function openTrackedLink(token: string) {
  return publicApi.post<LinkOpenResult>(`/public/links/${encodeURIComponent(token)}/open`);
}

export function useRsvpView(token: string) {
  return useQuery({
    queryKey: qk.rsvp(token),
    queryFn: () => publicApi.get<RsvpView>(`/public/rsvp/${encodeURIComponent(token)}`),
    retry: (count, error) => !isApiError(error) || (error.status >= 500 && count < 2) || (error.status === 0 && count < 2),
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });
}

export function useSubmitRsvp(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RsvpSubmit) => publicApi.post<RsvpView>(`/public/rsvp/${encodeURIComponent(token)}`, data),
    onSuccess: (view) => qc.setQueryData(qk.rsvp(token), view),
  });
}
