import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { invalidateWedding, qk } from "../../api/queryKeys";
import type {
  AssignmentUpdate,
  AutoArrangeRequest,
  AutoArrangeResult,
  ConstraintCreate,
  SeatingConstraint,
  SeatingPlan,
  SeatingTable,
  TableCreate,
  TablesBulkCreate,
  TableUpdate,
} from "../../api/types";

const base = (wid: string, eid: string) => `/weddings/${wid}/events/${eid}/seating`;

export function useSeatingPlan(weddingId: string, eventId: string | null) {
  return useQuery({
    queryKey: qk.seating(weddingId, eventId ?? ""),
    queryFn: () => api.get<SeatingPlan>(base(weddingId, eventId!)),
    enabled: Boolean(eventId),
  });
}

export function useConstraints(weddingId: string) {
  return useQuery({
    queryKey: qk.constraints(weddingId),
    queryFn: () => api.get<SeatingConstraint[]>(`/weddings/${weddingId}/seating-constraints`),
  });
}

/** Mutations that return a fresh plan write it straight into the cache. */
function usePlanMutation<TVars>(weddingId: string, eventId: string, fn: (vars: TVars) => Promise<SeatingPlan>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (plan) => {
      qc.setQueryData(qk.seating(weddingId, eventId), plan);
    },
  });
}

export function useAssignSeat(weddingId: string, eventId: string) {
  return usePlanMutation(weddingId, eventId, ({ guestId, ...data }: AssignmentUpdate & { guestId: string }) =>
    api.put<SeatingPlan>(`${base(weddingId, eventId)}/assignments/${guestId}`, data),
  );
}

export function useClearSeats(weddingId: string, eventId: string) {
  return usePlanMutation(weddingId, eventId, (keepLocked: boolean) =>
    api.delete<SeatingPlan>(`${base(weddingId, eventId)}/assignments`, { keep_locked: keepLocked }),
  );
}

export function useAutoArrange(weddingId: string, eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AutoArrangeRequest) =>
      api.post<AutoArrangeResult>(`${base(weddingId, eventId)}/auto-arrange`, data),
    onSuccess: (result) => {
      qc.setQueryData(qk.seating(weddingId, eventId), result.plan);
    },
  });
}

function useTableMutation<TVars, TResult>(weddingId: string, eventId: string, fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.seating(weddingId, eventId) }),
  });
}

export function useCreateTable(weddingId: string, eventId: string) {
  return useTableMutation(weddingId, eventId, (data: TableCreate) =>
    api.post<SeatingTable>(`${base(weddingId, eventId)}/tables`, data),
  );
}

export function useBulkCreateTables(weddingId: string, eventId: string) {
  return useTableMutation(weddingId, eventId, (data: TablesBulkCreate) =>
    api.post<SeatingTable[]>(`${base(weddingId, eventId)}/tables/bulk`, data),
  );
}

export function useUpdateTable(weddingId: string, eventId: string) {
  return useTableMutation(weddingId, eventId, ({ id, data }: { id: string; data: TableUpdate }) =>
    api.patch<SeatingTable>(`${base(weddingId, eventId)}/tables/${id}`, data),
  );
}

export function useDeleteTable(weddingId: string, eventId: string) {
  return useTableMutation(weddingId, eventId, (tableId: string) =>
    api.delete(`${base(weddingId, eventId)}/tables/${tableId}`),
  );
}

export function useCreateConstraint(weddingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ConstraintCreate) =>
      api.post<SeatingConstraint>(`/weddings/${weddingId}/seating-constraints`, data),
    // Rules apply to every event's plan (violations change).
    onSuccess: () => invalidateWedding(qc, weddingId, "constraints", "seating"),
  });
}

export function useDeleteConstraint(weddingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/weddings/${weddingId}/seating-constraints/${id}`),
    onSuccess: () => invalidateWedding(qc, weddingId, "constraints", "seating"),
  });
}
