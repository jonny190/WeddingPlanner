import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { qk } from "../../api/queryKeys";
import type { Invite, InviteCreate, Member, PasswordChange, Role, Tenant } from "../../api/types";
import { useSession } from "../../auth/session";

export function useMembers() {
  return useQuery({ queryKey: qk.members, queryFn: () => api.get<Member[]>("/tenants/current/members") });
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

/** Invitations sent but not yet accepted (admins only). */
export function useInvites(enabled = true) {
  return useQuery({
    queryKey: qk.invites,
    queryFn: () => api.get<Invite[]>("/tenants/current/invites"),
    enabled,
  });
}

export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: InviteCreate) => api.post<Invite>("/tenants/current/invites", data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.invites }),
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tenants/current/invites/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.invites }),
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: (data: PasswordChange) => api.post<void>("/auth/password", data) });
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
