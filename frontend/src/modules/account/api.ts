import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { qk } from "../../api/queryKeys";
import type { Member, MemberCreate, Role, Tenant } from "../../api/types";
import { useSession } from "../../auth/session";

export function useMembers() {
  return useQuery({ queryKey: qk.members, queryFn: () => api.get<Member[]>("/tenants/current/members") });
}

export function useAddMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MemberCreate) => api.post<Member>("/tenants/current/members", data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.members }),
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      api.patch<Member>(`/tenants/current/members/${id}`, { role }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.members }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tenants/current/members/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.members }),
  });
}

export function useRenameTenant() {
  const { refresh } = useSession();
  return useMutation({
    mutationFn: (name: string) => api.patch<Tenant>("/tenants/current", { name }),
    onSuccess: () => refresh(),
  });
}

/** Create another account; the caller decides whether to switch to it. */
export function useCreateTenant() {
  const { refresh } = useSession();
  return useMutation({
    mutationFn: (name: string) => api.post<Tenant>("/tenants", { name }),
    onSuccess: () => refresh(),
  });
}
