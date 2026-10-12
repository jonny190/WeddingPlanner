import type { Role } from "../api/types";

const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export function hasRole(role: Role | null | undefined, minimum: Role): boolean {
  return role ? RANK[role] >= RANK[minimum] : false;
}

export const canEdit = (role: Role | null | undefined) => hasRole(role, "editor");
export const isAdmin = (role: Role | null | undefined) => hasRole(role, "admin");
